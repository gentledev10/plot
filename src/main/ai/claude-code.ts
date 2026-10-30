import { type ChildProcess, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, isAbsolute, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { AppError } from '../errors';

export interface AgentRunInput {
  cwd: string;
  contextDir: string;
  prompt: string;
  schema: object;
  signal: AbortSignal;
  onActivity(activity: string): void;
}

export interface AgentRunResult {
  output: unknown;
  costUsd?: number;
}

export interface ReviewAgent {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

type Spawn = (command: string, args: readonly string[], options: object) => ChildProcess;

interface ClaudeCodeOptions {
  command?: readonly string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawnProcess?: Spawn;
}

type StreamEvent =
  | { kind: 'tool'; name: string; input: Record<string, unknown> }
  | { kind: 'result'; isError: boolean; message?: string; output?: unknown; costUsd?: number };

export function claudeArguments(input: Pick<AgentRunInput, 'prompt' | 'schema' | 'contextDir'>) {
  return [
    '--print',
    input.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--json-schema',
    JSON.stringify(input.schema),
    '--tools',
    'Read,Grep,Glob',
    '--restricted',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--add-dir',
    input.contextDir,
  ];
}

export function parseStreamLine(line: string): StreamEvent[] {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (event.type === 'result') {
    return [
      {
        kind: 'result',
        isError: event.is_error === true,
        message: typeof event.result === 'string' ? event.result : undefined,
        output: event.structured_output,
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined,
      },
    ];
  }
  const message = event.message as { content?: unknown } | undefined;
  if (event.type !== 'assistant' || !Array.isArray(message?.content)) {
    return [];
  }
  return message.content.flatMap((block: Record<string, unknown>) =>
    block.type === 'tool_use' && typeof block.name === 'string'
      ? [
          {
            kind: 'tool' as const,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          },
        ]
      : [],
  );
}

export function describeToolUse(
  name: string,
  input: Record<string, unknown>,
  roots: readonly string[],
): string {
  const path = typeof input.file_path === 'string' ? displayPath(input.file_path, roots) : '';
  switch (name) {
    case 'Read':
      return `Reading ${path || 'a file'}`;
    case 'Grep':
      return `Searching for "${String(input.pattern ?? '')}"`;
    case 'Glob':
      return `Looking for ${String(input.pattern ?? 'files')}`;
    case 'StructuredOutput':
      return 'Writing the review map';
    default:
      return `Using ${name}`;
  }
}

function displayPath(path: string, roots: readonly string[]): string {
  for (const root of roots) {
    const fromRoot = relative(root, path);
    if (!fromRoot.startsWith('..') && !isAbsolute(fromRoot)) {
      return fromRoot;
    }
  }
  return basename(path);
}

function rootsOf(cwd: string): string[] {
  try {
    return [cwd, realpathSync(cwd)];
  } catch {
    return [cwd];
  }
}

export function createClaudeCodeAgent({
  command = ['claude'],
  env = process.env,
  timeoutMs = 15 * 60_000,
  spawnProcess = spawn,
}: ClaudeCodeOptions = {}): ReviewAgent {
  return {
    run(input) {
      const [executable = 'claude', ...prefix] = command;
      const roots = rootsOf(input.cwd);
      return new Promise((resolve, reject) => {
        const child = spawnProcess(executable, [...prefix, ...claudeArguments(input)], {
          cwd: input.cwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let result: Extract<StreamEvent, { kind: 'result' }> | undefined;
        let stderr = '';
        let failure: AppError | undefined;

        const stop = (error: AppError) => {
          failure ??= error;
          child.kill('SIGTERM');
        };
        const timer = setTimeout(
          () => stop(new AppError('ai-failed', 'The AI review took too long and was stopped.')),
          timeoutMs,
        );
        const onAbort = () => stop(new AppError('ai-cancelled', 'The AI review was cancelled.'));
        input.signal.addEventListener('abort', onAbort, { once: true });

        child.stderr?.on('data', (chunk: Buffer) => {
          stderr = (stderr + chunk.toString('utf8')).slice(-4_000);
        });
        if (child.stdout) {
          createInterface({ input: child.stdout }).on('line', (line) => {
            for (const event of parseStreamLine(line)) {
              if (event.kind === 'tool') {
                input.onActivity(describeToolUse(event.name, event.input, roots));
              } else {
                result = event;
              }
            }
          });
        }

        child.on('error', (error: NodeJS.ErrnoException) => {
          failure ??=
            error.code === 'ENOENT'
              ? new AppError(
                  'ai-not-installed',
                  'Claude Code is not installed. Install it from https://claude.com/claude-code and sign in.',
                  { cause: error },
                )
              : new AppError('ai-failed', `Could not start Claude Code: ${error.message}`, {
                  cause: error,
                });
        });
        child.on('close', () => {
          clearTimeout(timer);
          input.signal.removeEventListener('abort', onAbort);
          if (failure) {
            reject(failure);
          } else if (!result) {
            reject(
              new AppError(
                'ai-failed',
                `Claude Code stopped without a result. ${lastLine(stderr)}`.trim(),
              ),
            );
          } else if (result.isError) {
            reject(new AppError('ai-failed', result.message ?? 'Claude Code reported an error.'));
          } else if (result.output === undefined) {
            reject(new AppError('ai-invalid-output', 'Claude Code did not return a review map.'));
          } else {
            resolve({ output: result.output, costUsd: result.costUsd });
          }
        });
      });
    },
  };
}

function lastLine(text: string): string {
  return text.trim().split('\n').filter(Boolean).at(-1) ?? '';
}
