import { execFile } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<RunResult>;

export type CommandFailure = 'not-found' | 'exit' | 'timeout';

export class CommandError extends Error {
  constructor(
    readonly failure: CommandFailure,
    readonly command: string,
    readonly stderr: string,
    readonly exitCode?: number,
  ) {
    super(describeFailure(failure, command, stderr, exitCode));
    this.name = 'CommandError';
  }
}

function describeFailure(
  failure: CommandFailure,
  command: string,
  stderr: string,
  exitCode?: number,
): string {
  switch (failure) {
    case 'not-found':
      return `${command} was not found on PATH`;
    case 'timeout':
      return `${command} timed out`;
    case 'exit':
      return `${command} exited with code ${exitCode ?? 'unknown'}: ${stderr.trim()}`;
  }
}

export interface BufferRunResult {
  stdout: Buffer;
  stderr: string;
}

export type BufferCommandRunner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<BufferRunResult>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

function execute(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
        encoding: 'buffer',
        windowsHide: true,
      },
      (error, stdout, stderrBuffer) => {
        const stderr = stderrBuffer.toString('utf8');
        if (!error) {
          resolve({ stdout, stderr });
          return;
        }
        if (error.code === 'ENOENT') {
          reject(new CommandError('not-found', command, stderr));
        } else if (error.killed) {
          reject(new CommandError('timeout', command, stderr));
        } else {
          const exitCode = typeof error.code === 'number' ? error.code : undefined;
          reject(new CommandError('exit', command, stderr, exitCode));
        }
      },
    );
  });
}

export const runCommand: CommandRunner = async (command, args, options = {}) => {
  const { stdout, stderr } = await execute(command, args, options);
  return { stdout: stdout.toString('utf8'), stderr };
};

export const runCommandForBuffer: BufferCommandRunner = (command, args, options = {}) =>
  execute(command, args, options);
