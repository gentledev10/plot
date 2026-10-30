import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import { AppError } from '../errors';
import { type BufferCommandRunner, CommandError, type CommandRunner } from '../system/process';
import { isolatedGitEnvironment } from './environment';
import { classifyBlob, parseNumstat, parseRawDiff, toChangedFiles } from './parse';

export interface RepositoryRef {
  owner: string;
  repo: string;
}

export interface RepositoryCache {
  fetchCommits(repository: RepositoryRef, commits: readonly string[]): Promise<void>;
  diff(repository: RepositoryRef, from: string, to: string): Promise<ChangedFile[]>;
  readBlob(repository: RepositoryRef, blob: string, maxBytes: number): Promise<BlobContent>;
}

export interface RepositoryCacheOptions {
  rootDir: string;
  run: CommandRunner;
  runForBuffer: BufferCommandRunner;
  env: NodeJS.ProcessEnv;
  authHeader(): Promise<string | undefined>;
  remoteUrl?(repository: RepositoryRef): string;
}

const FETCH_TIMEOUT_MS = 5 * 60_000;

export function createRepositoryCache({
  rootDir,
  run,
  runForBuffer,
  env,
  authHeader,
  remoteUrl = ({ owner, repo }) => `https://github.com/${owner}/${repo}.git`,
}: RepositoryCacheOptions): RepositoryCache {
  const fetched = new Set<string>();
  const queues = new Map<string, Promise<unknown>>();

  function directory({ owner, repo }: RepositoryRef): string {
    return join(rootDir, owner.toLowerCase(), `${repo.toLowerCase()}.git`);
  }

  async function git(dir: string, args: readonly string[], timeoutMs?: number): Promise<string> {
    const options = { env: isolatedGitEnvironment(env, await authHeader()), timeoutMs };
    try {
      return (await run('git', ['--git-dir', dir, ...args], options)).stdout;
    } catch (error) {
      throw toGitError(args, error);
    }
  }

  async function gitBuffer(dir: string, args: readonly string[]): Promise<Buffer> {
    const options = { env: isolatedGitEnvironment(env, await authHeader()) };
    try {
      return (await runForBuffer('git', ['--git-dir', dir, ...args], options)).stdout;
    } catch (error) {
      throw toGitError(args, error);
    }
  }

  function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(
      key,
      next.catch(() => {}),
    );
    return next;
  }

  async function ensureRepository(repository: RepositoryRef): Promise<string> {
    const dir = directory(repository);
    if (existsSync(join(dir, 'HEAD'))) {
      return dir;
    }
    await mkdir(dir, { recursive: true });
    await git(dir, ['init', '--bare', '--quiet']);
    await git(dir, ['config', 'remote.origin.url', remoteUrl(repository)]);
    await git(dir, ['config', 'remote.origin.promisor', 'true']);
    await git(dir, ['config', 'remote.origin.partialclonefilter', 'blob:none']);
    return dir;
  }

  return {
    fetchCommits(repository, commits) {
      const dir = directory(repository);
      return serialized(dir, async () => {
        const missing = [...new Set(commits)].filter((commit) => !fetched.has(`${dir}@${commit}`));
        if (missing.length === 0) {
          return;
        }
        await ensureRepository(repository);
        await git(
          dir,
          [
            'fetch',
            '--quiet',
            '--no-tags',
            '--no-write-fetch-head',
            '--depth=1',
            '--filter=blob:none',
            'origin',
            ...missing,
          ],
          FETCH_TIMEOUT_MS,
        );
        for (const commit of missing) {
          fetched.add(`${dir}@${commit}`);
        }
      });
    },

    async diff(repository, from, to) {
      const dir = directory(repository);
      const options = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-z'];
      const numstat = await git(dir, [...options, '--numstat', from, to], FETCH_TIMEOUT_MS);
      const raw = await git(dir, [...options, '--raw', '--no-abbrev', from, to]);
      return toChangedFiles(parseRawDiff(raw), parseNumstat(numstat));
    },

    async readBlob(repository, blob, maxBytes) {
      const dir = directory(repository);
      const size = Number((await git(dir, ['cat-file', '-s', blob])).trim());
      if (size > maxBytes) {
        return { kind: 'too-large', size };
      }
      return classifyBlob(await gitBuffer(dir, ['cat-file', 'blob', blob]));
    },
  };
}

function toGitError(args: readonly string[], error: unknown): AppError {
  if (error instanceof CommandError && error.failure === 'not-found') {
    return new AppError(
      'git-not-installed',
      'Git is not installed. Install it with `xcode-select --install`.',
      { cause: error },
    );
  }
  const subcommand = args.find((arg) => !arg.startsWith('-')) ?? 'command';
  const detail =
    error instanceof CommandError
      ? (error.stderr.trim().split('\n').find(Boolean) ?? error.message)
      : String(error);
  return new AppError('git-failed', `git ${subcommand} failed: ${detail}`, { cause: error });
}
