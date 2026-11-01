import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AI_PROVIDERS } from '@shared/ai';
import { AppError } from '../errors';
import {
  type AgentOptions,
  type AgentRunInput,
  DEFAULT_TIMEOUT_MS,
  lastLine,
  REJECTED_KEY,
  type ReviewAgent,
  rejectedKey,
  rootsOf,
  runAgentProcess,
} from './agent';

const { name, installUrl, signInCommand, apiKeyVendor } = AI_PROVIDERS.codex;

interface CodexFiles {
  schemaFile: string;
  outputFile: string;
}

export type CodexEvent = { kind: 'activity'; text: string } | { kind: 'failed'; message: string };

export function codexArguments(
  input: Pick<AgentRunInput, 'prompt' | 'cwd' | 'model'>,
  files: CodexFiles,
): string[] {
  return [
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--color',
    'never',
    '--cd',
    input.cwd,
    '--output-schema',
    files.schemaFile,
    '--output-last-message',
    files.outputFile,
    '--config',
    'web_search="disabled"',
    '--config',
    'shell_environment_policy.inherit="core"',
    ...(input.model ? [`--model=${input.model}`] : []),
    '--',
    input.prompt,
  ];
}

type Json = Record<string, unknown>;

export function parseCodexLine(line: string, roots: readonly string[]): CodexEvent[] {
  let event: Json;
  try {
    event = JSON.parse(line) as Json;
  } catch {
    return [];
  }
  const item = (typeof event.item === 'object' && event.item !== null ? event.item : {}) as Json;
  switch (event.type) {
    case 'item.started':
      if (item.type === 'command_execution' && typeof item.command === 'string') {
        return [{ kind: 'activity', text: `Running ${shortCommand(item.command, roots)}` }];
      }
      if (item.type === 'mcp_tool_call') {
        return [{ kind: 'activity', text: `Using ${String(item.tool ?? 'a tool')}` }];
      }
      return [];
    case 'item.completed':
      return item.type === 'agent_message'
        ? [{ kind: 'activity', text: 'Writing the review map' }]
        : [];
    case 'turn.failed': {
      const error = (event.error ?? {}) as Json;
      return [
        {
          kind: 'failed',
          message: typeof error.message === 'string' ? error.message : `${name} reported an error.`,
        },
      ];
    }
    case 'error':
      return typeof event.message === 'string' && event.message.startsWith('Reconnecting')
        ? [{ kind: 'activity', text: 'Reconnecting to OpenAI' }]
        : [];
    default:
      return [];
  }
}

function shortCommand(command: string, roots: readonly string[]): string {
  const wrapped = /^(?:\/bin\/)?(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(command);
  let text = wrapped?.[2] ?? command;
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    text = text.split(`${root}/`).join('');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function describeFailure(message: string, usedApiKey: boolean): string {
  if (!REJECTED_KEY.test(message)) {
    return message;
  }
  return usedApiKey
    ? rejectedKey(apiKeyVendor)
    : `${name} is not signed in. Run \`${signInCommand}\` in a terminal, then try again.`;
}

export function createCodexAgent({
  command = ['codex'],
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnProcess = spawn,
}: AgentOptions = {}): ReviewAgent {
  return {
    async run(input) {
      const scratch = await mkdtemp(join(tmpdir(), 'plot-codex-'));
      const files = {
        schemaFile: join(scratch, 'schema.json'),
        outputFile: join(scratch, 'review.json'),
      };
      try {
        await writeFile(files.schemaFile, JSON.stringify(input.schema));
        const roots = rootsOf(input.cwd);
        let failure: string | undefined;
        const { exitCode, stderr } = await runAgentProcess({
          name,
          installUrl,
          command,
          args: codexArguments(input, files),
          cwd: input.cwd,
          env: input.apiKey ? { ...env, CODEX_API_KEY: input.apiKey } : env,
          timeoutMs,
          spawnProcess,
          signal: input.signal,
          onLine(line) {
            for (const event of parseCodexLine(line, roots)) {
              if (event.kind === 'activity') {
                input.onActivity(event.text);
              } else {
                failure = event.message;
              }
            }
          },
        });
        if (failure !== undefined) {
          throw new AppError('ai-failed', describeFailure(failure, input.apiKey !== undefined));
        }
        if (exitCode !== 0) {
          throw new AppError(
            'ai-failed',
            `${name} stopped with exit code ${exitCode}. ${lastLine(stderr)}`.trim(),
          );
        }
        return { output: await readOutput(files.outputFile) };
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    },
  };
}

async function readOutput(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new AppError('ai-invalid-output', `${name} did not return a review map.`, {
      cause: error,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AppError('ai-invalid-output', `${name} returned a review map that is not JSON.`, {
      cause: error,
    });
  }
}
