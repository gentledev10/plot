import { spawn } from 'node:child_process';
import { AI_PROVIDERS } from '@shared/ai';
import { AppError } from '../errors';
import {
  type AgentOptions,
  type AgentRunInput,
  DEFAULT_TIMEOUT_MS,
  displayPath,
  lastLine,
  REJECTED_KEY,
  type ReviewAgent,
  rejectedKey,
  rootsOf,
  runAgentProcess,
} from './agent';

type StreamEvent =
  | { kind: 'tool'; name: string; input: Record<string, unknown> }
  | { kind: 'result'; isError: boolean; message?: string; output?: unknown; costUsd?: number };

const { name, installUrl, apiKeyVendor } = AI_PROVIDERS['claude-code'];

// Claude Code prefers these over ANTHROPIC_API_KEY, so a chosen key would be ignored while they are set.
const AHEAD_OF_API_KEY = [
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

export function withApiKey(env: NodeJS.ProcessEnv, apiKey: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, ANTHROPIC_API_KEY: apiKey };
  for (const variable of AHEAD_OF_API_KEY) {
    delete result[variable];
  }
  return result;
}

export function claudeArguments(
  input: Pick<AgentRunInput, 'prompt' | 'schema' | 'contextDir' | 'model' | 'effort'>,
) {
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
    ...(input.model ? [`--model=${input.model}`] : []),
    ...(input.effort ? [`--effort=${input.effort}`] : []),
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
  tool: string,
  input: Record<string, unknown>,
  roots: readonly string[],
): string {
  const path = typeof input.file_path === 'string' ? displayPath(input.file_path, roots) : '';
  switch (tool) {
    case 'Read':
      return `Reading ${path || 'a file'}`;
    case 'Grep':
      return `Searching for "${String(input.pattern ?? '')}"`;
    case 'Glob':
      return `Looking for ${String(input.pattern ?? 'files')}`;
    case 'StructuredOutput':
      return 'Writing the review map';
    default:
      return `Using ${tool}`;
  }
}

export function createClaudeCodeAgent({
  command = ['claude'],
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnProcess = spawn,
}: AgentOptions = {}): ReviewAgent {
  return {
    async run(input) {
      const roots = rootsOf(input.cwd);
      let result: Extract<StreamEvent, { kind: 'result' }> | undefined;
      const { stderr } = await runAgentProcess({
        name,
        installUrl,
        command,
        args: claudeArguments(input),
        cwd: input.cwd,
        env: input.apiKey ? withApiKey(env, input.apiKey) : env,
        timeoutMs,
        spawnProcess,
        signal: input.signal,
        onLine(line) {
          for (const event of parseStreamLine(line)) {
            if (event.kind === 'tool') {
              input.onActivity(describeToolUse(event.name, event.input, roots));
            } else {
              result = event;
            }
          }
        },
      });
      if (!result) {
        throw new AppError(
          'ai-failed',
          `${name} stopped without a result. ${lastLine(stderr)}`.trim(),
        );
      }
      if (result.isError) {
        const message = result.message ?? `${name} reported an error.`;
        throw new AppError(
          'ai-failed',
          input.apiKey && REJECTED_KEY.test(message) ? rejectedKey(apiKeyVendor) : message,
        );
      }
      if (result.output === undefined) {
        throw new AppError('ai-invalid-output', `${name} did not return a review map.`);
      }
      return { output: result.output, costUsd: result.costUsd };
    },
  };
}
