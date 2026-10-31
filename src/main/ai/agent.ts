import type { ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, isAbsolute, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { AppError } from '../errors';

export interface AgentRunInput {
  cwd: string;
  contextDir: string;
  prompt: string;
  schema: object;
  model?: string;
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

export type Spawn = (command: string, args: readonly string[], options: object) => ChildProcess;

export interface AgentOptions {
  command?: readonly string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawnProcess?: Spawn;
}

export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

interface ProcessRun {
  name: string;
  installUrl: string;
  command: readonly string[];
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  spawnProcess: Spawn;
  signal: AbortSignal;
  onLine(line: string): void;
}

export interface ProcessExit {
  exitCode: number | null;
  stderr: string;
}

export function runAgentProcess(run: ProcessRun): Promise<ProcessExit> {
  const [executable = '', ...prefix] = run.command;
  return new Promise((resolve, reject) => {
    const child = run.spawnProcess(executable, [...prefix, ...run.args], {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let failure: AppError | undefined;

    const stop = (error: AppError) => {
      failure ??= error;
      child.kill('SIGTERM');
    };
    const timer = setTimeout(
      () => stop(new AppError('ai-failed', 'The AI review took too long and was stopped.')),
      run.timeoutMs,
    );
    const onAbort = () => stop(new AppError('ai-cancelled', 'The AI review was cancelled.'));
    run.signal.addEventListener('abort', onAbort, { once: true });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4_000);
    });
    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', run.onLine);
    }
    child.on('error', (error: NodeJS.ErrnoException) => {
      failure ??=
        error.code === 'ENOENT'
          ? new AppError(
              'ai-not-installed',
              `${run.name} is not installed. Install it from ${run.installUrl} and sign in.`,
              { cause: error },
            )
          : new AppError('ai-failed', `Could not start ${run.name}: ${error.message}`, {
              cause: error,
            });
    });
    child.on('close', (exitCode: number | null) => {
      clearTimeout(timer);
      run.signal.removeEventListener('abort', onAbort);
      if (failure) {
        reject(failure);
      } else {
        resolve({ exitCode, stderr });
      }
    });
  });
}

export function lastLine(text: string): string {
  return text.trim().split('\n').filter(Boolean).at(-1) ?? '';
}

export function rootsOf(cwd: string): string[] {
  try {
    return [cwd, realpathSync(cwd)];
  } catch {
    return [cwd];
  }
}

export function displayPath(path: string, roots: readonly string[]): string {
  for (const root of roots) {
    const fromRoot = relative(root, path);
    if (!fromRoot.startsWith('..') && !isAbsolute(fromRoot)) {
      return fromRoot;
    }
  }
  return basename(path);
}
