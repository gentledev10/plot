import { spawn } from 'node:child_process';
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import type { ExecutionSide, ExecutionSupport } from '@shared/review-execution';

const LIMIT = 64 * 1024;
const quote = (v: string) => JSON.stringify(v);
export function sandboxProfile(
  node: string,
  source: string,
  scratch: string,
  harness: string,
): string {
  return `(version 1)
(deny default)
(allow process-exec (literal ${quote(node)}))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath ${quote(source)}) (subpath ${quote(harness)})
 (subpath ${quote(dirname(dirname(node)))}) (subpath "/System") (subpath "/usr/lib")
 (subpath "/usr/share") (subpath "/private/var/db/dyld")
 (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random")
 (regex #"^/(opt/homebrew|usr/local)/(Cellar|opt)/.*\\.dylib$"))
(allow file-write* (subpath ${quote(scratch)}) (literal "/dev/null"))`;
}
export function runtimeEnvironment(node: string, scratch: string): NodeJS.ProcessEnv {
  return {
    PATH: `${dirname(node)}:/usr/bin:/bin`,
    LANG: 'en_US.UTF-8',
    TMPDIR: scratch,
    OPENSSL_CONF: '/dev/null',
  };
}
export async function sandboxRun(options: {
  node: string;
  cwd: string;
  harness: string;
  scratch: string;
  args: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ExecutionSide> {
  const profile = join(options.scratch, 'sandbox.sb');
  await writeFile(
    profile,
    sandboxProfile(options.node, options.cwd, options.scratch, options.harness),
    { mode: 0o600 },
  );
  if (options.signal?.aborted)
    return {
      status: 'cancelled',
      exitCode: null,
      stdout: '',
      stderr: '',
      command: ['node', ...options.args],
    };
  return new Promise((resolve) => {
    const command = ['node', ...options.args];
    const child = spawn('/usr/bin/sandbox-exec', ['-f', profile, options.node, ...options.args], {
      cwd: options.cwd,
      env: runtimeEnvironment(options.node, options.scratch),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stopped: 'timeout' | 'cancelled' | undefined;
    let hardKill: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
    };
    const stop = (reason: 'timeout' | 'cancelled') => {
      stopped = reason;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }
      hardKill ??= setTimeout(kill, 500);
    };
    const cancel = () => stop('cancelled');
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs ?? 30_000);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const collect = (side: 'stdout' | 'stderr', chunk: Buffer) => {
      if (side === 'stdout') stdout = (stdout + chunk.toString()).slice(0, LIMIT);
      else stderr = (stderr + chunk.toString()).slice(0, LIMIT);
    };
    child.stdout.on('data', (chunk) => collect('stdout', chunk));
    child.stderr.on('data', (chunk) => collect('stderr', chunk));
    const finish = (exitCode: number | null, error?: Error) => {
      clearTimeout(timer);
      if (hardKill) clearTimeout(hardKill);
      options.signal?.removeEventListener('abort', cancel);
      resolve({
        status: stopped ?? (exitCode === 0 ? 'completed' : 'failed'),
        exitCode,
        stdout,
        stderr: error ? `${stderr}\n${error.message}`.slice(0, LIMIT) : stderr,
        command,
      });
    };
    child.once('error', (error) => finish(null, error));
    child.once('close', (code) => finish(code));
  });
}

export interface ReviewRuntime {
  support(): Promise<ExecutionSupport>;
  node(): Promise<string>;
}
export function createReviewRuntime(env: NodeJS.ProcessEnv = process.env): ReviewRuntime {
  let resolved: Promise<{ node?: string; support: ExecutionSupport }> | undefined;
  const detect = async () => {
    if (process.platform !== 'darwin')
      return {
        support: { available: false, reason: 'Isolated execution currently requires macOS.' },
      };
    try {
      await access('/usr/bin/sandbox-exec');
    } catch {
      return {
        support: { available: false, reason: 'The macOS execution sandbox is unavailable.' },
      };
    }
    const candidates = [
      ...(env.PATH ?? '')
        .split(delimiter)
        .filter((p) => p.startsWith('/'))
        .map((p) => join(p, 'node')),
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
    ];
    for (const candidate of [...new Set(candidates)]) {
      let root: string | undefined;
      try {
        const node = await realpath(candidate);
        root = await realpath(await mkdtemp(join(tmpdir(), 'plot-runtime-')));
        const result = await sandboxRun({
          node,
          cwd: root,
          scratch: root,
          harness: root,
          args: ['--version'],
          timeoutMs: 5000,
        });
        const version = /^v(\d+)\.(\d+)\.(\d+)/.exec(result.stdout.trim());
        if (result.status !== 'completed' || !version || Number(version[1]) < 22) continue;
        // Check flags in the same sandbox rather than guessing from a version number.
        const help = await sandboxRun({
          node,
          cwd: root,
          scratch: root,
          harness: root,
          args: ['--help'],
          timeoutMs: 5000,
        });
        if (!help.stdout.includes('--test-isolation') || !help.stdout.includes('--test-timeout'))
          continue;
        return { node, support: { available: true, nodeVersion: version[0] } };
      } catch {
      } finally {
        if (root) await rm(root, { recursive: true, force: true });
      }
    }
    return {
      support: {
        available: false,
        reason:
          'A compatible Node.js runtime could not start in the execution sandbox. Install a current Node.js version.',
      },
    };
  };
  return {
    support: async () => {
      resolved ??= detect();
      return (await resolved).support;
    },
    node: async () => {
      resolved ??= detect();
      const result = await resolved;
      if (!result.node) throw new Error(result.support.reason);
      return result.node;
    },
  };
}
