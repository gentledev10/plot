import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import { AppError } from '../errors';
import { type BufferCommandRunner, CommandError, type CommandRunner } from '../system/process';
import { isolatedGitEnvironment } from './environment';
import { classifyBlob, parseNumstat, parseRawDiff, toChangedFiles } from './parse';

export interface RepositoryRef {
  host: string;
  owner: string;
  repo: string;
}

export interface RepositoryCache {
  fetchCommits(repository: RepositoryRef, commits: readonly string[]): Promise<void>;
  diff(repository: RepositoryRef, from: string, to: string): Promise<ChangedFile[]>;
  readBlob(repository: RepositoryRef, blob: string, maxBytes: number): Promise<BlobContent>;
  unifiedDiff(repository: RepositoryRef, from: string, to: string): Promise<string>;
  listFiles(repository: RepositoryRef, commit: string): Promise<string[]>;
  checkoutDirectories(
    repository: RepositoryRef,
    commit: string,
    directories: readonly string[],
    target: string,
  ): Promise<void>;
  removeCheckout(repository: RepositoryRef, target: string): Promise<void>;
}

export interface RepositoryCacheOptions {
  rootDir: string;
  run: CommandRunner;
  runForBuffer: BufferCommandRunner;
  env: NodeJS.ProcessEnv;
  authHeader(repository: RepositoryRef): Promise<string | undefined>;
  remoteUrl?(repository: RepositoryRef): string;
}

const FETCH_TIMEOUT_MS = 5 * 60_000;

export function createRepositoryCache({
  rootDir,
  run,
  runForBuffer,
  env,
  authHeader,
  remoteUrl = ({ host, owner, repo }) => `https://${host}/${owner}/${repo}.git`,
}: RepositoryCacheOptions): RepositoryCache {
  const fetched = new Set<string>();
  const queues = new Map<string, Promise<unknown>>();

  function directory({ host, owner, repo }: RepositoryRef): string {
    return join(rootDir, host, owner.toLowerCase(), `${repo.toLowerCase()}.git`);
  }

  async function git(
    repository: RepositoryRef,
    args: readonly string[],
    timeoutMs?: number,
  ): Promise<string> {
    return gitIn(repository, ['--git-dir', directory(repository)], args, timeoutMs);
  }

  async function gitIn(
    repository: RepositoryRef,
    location: readonly string[],
    args: readonly string[],
    timeoutMs?: number,
  ): Promise<string> {
    const options = { env: isolatedGitEnvironment(env, await authHeader(repository)), timeoutMs };
    try {
      return (await run('git', [...location, ...args], options)).stdout;
    } catch (error) {
      throw toGitError(args, error);
    }
  }

  async function gitBuffer(repository: RepositoryRef, args: readonly string[]): Promise<Buffer> {
    const options = { env: isolatedGitEnvironment(env, await authHeader(repository)) };
    try {
      return (await runForBuffer('git', ['--git-dir', directory(repository), ...args], options))
        .stdout;
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
    await git(repository, ['init', '--bare', '--quiet']);
    await git(repository, ['config', 'remote.origin.url', remoteUrl(repository)]);
    await git(repository, ['config', 'remote.origin.promisor', 'true']);
    await git(repository, ['config', 'remote.origin.partialclonefilter', 'blob:none']);
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
          repository,
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
      const options = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-z'];
      const numstat = await git(repository, [...options, '--numstat', from, to], FETCH_TIMEOUT_MS);
      const raw = await git(repository, [...options, '--raw', '--no-abbrev', from, to]);
      return toChangedFiles(parseRawDiff(raw), parseNumstat(numstat));
    },

    unifiedDiff(repository, from, to) {
      return git(repository, [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '-M',
        from,
        to,
      ]);
    },

    async listFiles(repository, commit) {
      const output = await git(repository, ['ls-tree', '-r', '-z', '--name-only', commit]);
      return output.split('\0').filter(Boolean);
    },

    checkoutDirectories(repository, commit, directories, target) {
      const dir = directory(repository);
      return serialized(dir, async () => {
        await git(repository, [
          'worktree',
          'add',
          '--no-checkout',
          '--detach',
          '--quiet',
          target,
          commit,
        ]);
        await gitIn(
          repository,
          ['-C', target],
          ['sparse-checkout', 'set', '--cone', '--', ...directories],
        );
        await gitIn(
          repository,
          ['-C', target],
          ['reset', '--hard', '--quiet', commit],
          FETCH_TIMEOUT_MS,
        );
      });
    },

    removeCheckout(repository, target) {
      const dir = directory(repository);
      return serialized(dir, async () => {
        if (!existsSync(join(dir, 'HEAD'))) {
          return;
        }
        await git(repository, ['worktree', 'remove', '--force', target]).catch(() => undefined);
        await git(repository, ['worktree', 'prune']);
      });
    },

    async readBlob(repository, blob, maxBytes) {
      const size = Number((await git(repository, ['cat-file', '-s', blob])).trim());
      if (size > maxBytes) {
        return { kind: 'too-large', size };
      }
      return classifyBlob(await gitBuffer(repository, ['cat-file', 'blob', blob]));
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
