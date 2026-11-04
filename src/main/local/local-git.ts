import { createHash } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import {
  isLocalCompare,
  isLocalRef,
  type LocalCompare,
  type LocalDiff,
  type LocalHistory,
  type LocalStatus,
  type LocalTarget,
  MAX_LOCAL_COMMITS,
} from '@shared/local';
import { AppError } from '../errors';
import { classifyBlob, parseNumstat, parseRawDiff, toChangedFiles } from '../git/parse';
import { type BufferCommandRunner, CommandError, type CommandRunner } from '../system/process';

// Git's well-known id of the empty tree, used as the base of a repository with no commits yet.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const DIFF_OPTIONS = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-z'];
const LINE_COUNT_LIMIT = 1024 * 1024;
type CompareOptions = Omit<LocalTarget, 'repositoryId' | 'compare'>;

export interface LocalTracking {
  branch: string | null;
  remotes: Record<string, string>;
  upstream: { remote: string; branch: string } | null;
}

export interface LocalGit {
  topLevel(path: string): Promise<string>;
  status(root: string): Promise<LocalStatus>;
  tracking(root: string): Promise<LocalTracking>;
  history(root: string, ref?: string): Promise<LocalHistory>;
  diff(root: string, compare: LocalCompare, options?: CompareOptions): Promise<LocalDiff>;
  signature(root: string, compare: LocalCompare, options?: CompareOptions): Promise<string>;
  readBlob(root: string, blob: string, maxBytes: number): Promise<BlobContent>;
  readFile(root: string, path: string, maxBytes: number): Promise<BlobContent>;
}

interface LocalGitOptions {
  run: CommandRunner;
  runForBuffer: BufferCommandRunner;
  env: NodeJS.ProcessEnv;
  maxSnapshotCacheBytes?: number;
}

const REPOSITORY_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
];

// The repository is the user's own, so their git config applies. Variables that would point
// git at another repository are dropped, and git must not take locks the user's tools rely on.
export function localGitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  for (const name of REPOSITORY_VARIABLES) {
    delete next[name];
  }
  return next;
}

export function createLocalGit({
  run,
  runForBuffer,
  env,
  maxSnapshotCacheBytes = 256 * 1024 * 1024,
}: LocalGitOptions): LocalGit {
  const environment = localGitEnvironment(env);
  const objectCaches = new Map<string, Promise<string>>();
  const objectEnvironments = new Map<string, Promise<NodeJS.ProcessEnv>>();
  const indexQueues = new Map<string, Promise<void>>();
  const prefix = (root: string) => [
    '-C',
    root,
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'core.splitIndex=false',
  ];

  async function git(root: string, args: readonly string[]): Promise<string> {
    try {
      const filterKeys = ['diff', 'status'].includes(args[0] ?? '')
        ? ((
            await optional(root, [
              'config',
              '--null',
              '--name-only',
              '--get-regexp',
              '^filter\\..*\\.(clean|process|required)$',
            ])
          )
            ?.split('\0')
            .filter(Boolean) ?? [])
        : [];
      const filterOverrides = filterKeys.flatMap((key) => [
        '-c',
        `${key}=${key.endsWith('.required') ? 'false' : ''}`,
      ]);
      return (
        await run('git', [...prefix(root), ...filterOverrides, ...args], {
          env: await objectEnvironment(root),
        })
      ).stdout;
    } catch (error) {
      throw toLocalGitError(args, error);
    }
  }

  async function optional(root: string, args: readonly string[]): Promise<string | null> {
    try {
      const output = (
        await run('git', [...prefix(root), ...args], { env: await objectEnvironment(root) })
      ).stdout;
      return output.trim() || null;
    } catch (error) {
      if (error instanceof CommandError && error.failure === 'exit') {
        return null;
      }
      throw toLocalGitError(args, error);
    }
  }

  async function base(root: string): Promise<LocalDiff['base']> {
    const head = await optional(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    return head ? { name: 'HEAD', commit: head } : null;
  }

  function validateComparison(compare: LocalCompare, options: CompareOptions): void {
    const allowed = compare === 'commits' ? ['commits', 'headRef'] : [];
    if (!isLocalCompare(compare) || Object.keys(options).some((key) => !allowed.includes(key)))
      throw new AppError('invalid-argument', 'Expected uncommitted changes or selected commits.');
    if (
      compare === 'commits' &&
      (!Array.isArray(options.commits) ||
        options.commits.length < 1 ||
        options.commits.length > MAX_LOCAL_COMMITS ||
        new Set(options.commits).size !== options.commits.length ||
        options.commits.some((sha) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) ||
        (options.headRef !== undefined && !isLocalRef(options.headRef)))
    )
      throw new AppError('invalid-argument', 'Select between one and 100 unique commits.');
  }

  async function untracked(root: string): Promise<string[]> {
    const output = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
    return output.split('\0').filter(Boolean);
  }

  async function findCommit(root: string, ref: string): Promise<string | null> {
    const candidates =
      ref === 'HEAD' || ref.startsWith('refs/') || /^[0-9a-f]{40,64}$/.test(ref)
        ? [ref]
        : [`refs/heads/${ref}`, `refs/remotes/${ref}`, ref];
    for (const candidate of candidates) {
      const oid = await optional(root, [
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `${candidate}^{commit}`,
      ]);
      if (oid) return oid;
    }
    return null;
  }

  async function resolveCommit(root: string, ref: string): Promise<string> {
    if (!isLocalRef(ref))
      throw new AppError('invalid-argument', 'Expected a Git branch name or object id.');
    const oid = await findCommit(root, ref);
    if (!oid)
      throw new AppError('invalid-argument', 'That Git reference does not identify a commit.');
    return oid;
  }

  async function objectEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
    const cache = objectCaches.get(root);
    if (!cache) return environment;
    let cached = objectEnvironments.get(root);
    if (!cached) {
      cached = (async () => {
        const objects = (
          await run(
            'git',
            [...prefix(root), 'rev-parse', '--path-format=absolute', '--git-path', 'objects'],
            { env: environment },
          )
        ).stdout.trim();
        return {
          ...environment,
          GIT_OBJECT_DIRECTORY: await cache,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(objects),
        };
      })();
      objectEnvironments.set(root, cached);
    }
    return cached;
  }

  async function ensureObjectCache(root: string): Promise<void> {
    if (!objectCaches.has(root)) {
      if (objectCaches.size >= 32)
        throw new AppError(
          'git-failed',
          'Too many snapshot repositories are open. Restart Plot to clear the snapshot cache.',
        );
      objectCaches.set(root, mkdtemp(join(tmpdir(), 'plot-local-objects-')));
    }
    await objectCaches.get(root);
  }

  async function isolatedIndex<T>(
    root: string,
    action: (
      indexGit: (args: readonly string[]) => Promise<string>,
      directory: string,
    ) => Promise<T>,
  ): Promise<T> {
    const previous = indexQueues.get(root) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    indexQueues.set(root, queued);
    await previous;
    try {
      return await runIsolatedIndex(root, action);
    } finally {
      release();
      if (indexQueues.get(root) === queued) indexQueues.delete(root);
    }
  }

  async function cacheFiles(root: string): Promise<Map<string, number>> {
    const objects = await objectCaches.get(root);
    if (!objects) throw new AppError('git-failed', 'Snapshot cache is unavailable.');
    const files = await readdir(objects, { recursive: true, withFileTypes: true });
    const entries = new Map<string, number>();
    for (const file of files)
      if (file.isFile()) {
        const path = join(file.parentPath, file.name);
        entries.set(path, (await lstat(path)).size);
      }
    return entries;
  }

  async function runIsolatedIndex<T>(
    root: string,
    action: (
      indexGit: (args: readonly string[]) => Promise<string>,
      directory: string,
    ) => Promise<T>,
  ): Promise<T> {
    await ensureObjectCache(root);
    const before = await cacheFiles(root);
    const directory = await mkdtemp(join(tmpdir(), 'plot-local-index-'));
    const indexGit = async (args: readonly string[]) => {
      try {
        return (
          await run('git', [...prefix(root), ...args], {
            env: { ...(await objectEnvironment(root)), GIT_INDEX_FILE: join(directory, 'index') },
          })
        ).stdout;
      } catch (error) {
        throw toLocalGitError(args, error);
      }
    };
    try {
      const result = await action(indexGit, directory);
      const after = await cacheFiles(root);
      if ([...after.values()].reduce((sum, size) => sum + size, 0) > maxSnapshotCacheBytes) {
        throw new AppError('git-failed', 'Snapshot cache is full. Restart Plot to clear it.');
      }
      return result;
    } catch (error) {
      const after = await cacheFiles(root);
      await Promise.all(
        [...after.keys()]
          .filter((path) => !before.has(path))
          .map((path) => rm(path, { force: true })),
      );
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async function selectedSnapshot(
    root: string,
    commits: string[],
  ): Promise<{ from: string; to: string; name: string }> {
    const selected = new Set(await Promise.all(commits.map((sha) => resolveCommit(root, sha))));
    const ordered = (await git(root, ['rev-list', '--topo-order', '--reverse', ...selected, '--']))
      .trim()
      .split('\n')
      .filter((sha) => selected.has(sha));
    return isolatedIndex(root, async (indexGit, directory) => {
      const first = ordered[0];
      if (!first) throw new AppError('invalid-argument', 'Select at least one commit.');
      const parent = await optional(root, ['rev-parse', '--verify', '--quiet', `${first}^1`]);
      await indexGit(parent ? ['read-tree', parent] : ['read-tree', '--empty']);
      const from = parent ?? (await indexGit(['write-tree'])).trim();
      for (const sha of ordered) {
        const parent = await optional(root, ['rev-parse', '--verify', '--quiet', `${sha}^1`]);
        const patch = await runForBuffer(
          'git',
          [...prefix(root), ...DIFF_OPTIONS, '--binary', '--full-index', parent ?? from, sha, '--'],
          { env: environment },
        );
        if (!patch.stdout.length) continue;
        const path = join(directory, 'selected.patch');
        await writeFile(path, patch.stdout);
        try {
          await indexGit(['apply', '--cached', '--whitespace=nowarn', '--', path]);
        } catch (error) {
          throw new AppError(
            'git-failed',
            'Selected commits conflict when replayed without intervening commits. Select their dependencies and try again.',
            { cause: error },
          );
        }
      }
      return { from, to: (await indexGit(['write-tree'])).trim(), name: 'Selected commits' };
    });
  }

  async function snapshotDiff(root: string, options: CompareOptions): Promise<LocalDiff> {
    const { from, to, name } = await selectedSnapshot(root, options.commits ?? []);
    const [raw, numstat, branch] = await Promise.all([
      git(root, [...DIFF_OPTIONS, '--raw', '--no-abbrev', from, to, '--']),
      git(root, [...DIFF_OPTIONS, '--numstat', from, to, '--']),
      optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    ]);
    return {
      branch,
      base: { name, commit: from },
      files: toChangedFiles(parseRawDiff(raw), parseNumstat(numstat)),
    };
  }

  return {
    async history(root, ref = 'HEAD') {
      if (!isLocalRef(ref))
        throw new AppError('invalid-argument', 'Expected a Git branch name or object id.');
      const branches = (
        await git(root, [
          'for-each-ref',
          '--sort=refname',
          '--format=%(refname)%00%(HEAD)',
          'refs/heads/',
          'refs/remotes/',
        ])
      )
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name = '', current] = line.split('\0');
          return {
            name: name.replace(/^refs\/(heads|remotes)\//, ''),
            current: current?.trim() === '*',
            remote: name.startsWith('refs/remotes/'),
          };
        });
      const commit = await findCommit(root, ref);
      if (!commit) {
        if (ref !== 'HEAD' || !(await optional(root, ['symbolic-ref', '--quiet', 'HEAD'])))
          throw new AppError('invalid-argument', 'That Git reference does not identify a commit.');
        return { branches, commits: [], hasMore: false };
      }
      const output = await git(root, [
        'log',
        '-101',
        '--format=%H%x00%P%x00%s%x00%an%x00%aI',
        commit,
        '--',
      ]);
      const commits = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [sha = '', parents = '', subject = '', author = '', date = ''] = line.split('\0');
          return { sha, parents: parents.split(' ').filter(Boolean), subject, author, date };
        });
      return { branches, commits: commits.slice(0, 100), hasMore: commits.length > 100 };
    },

    async topLevel(path) {
      const top = await optional(path, ['rev-parse', '--show-toplevel']);
      if (!top) {
        throw new AppError('not-a-repository', 'That folder is not inside a git repository.');
      }
      return top;
    },

    // Counts uncommitted files without comparing their lines.
    async status(root) {
      const [branch, from, added] = await Promise.all([
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        base(root),
        untracked(root),
      ]);
      const changed = await git(root, [...DIFF_OPTIONS, '--name-only', from?.commit ?? EMPTY_TREE]);
      return { branch, changedFiles: changed.split('\0').filter(Boolean).length + added.length };
    },

    async tracking(root) {
      const [branch, urls] = await Promise.all([
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        optional(root, ['config', '--get-regexp', '^remote\\..*\\.url$']),
      ]);
      const remotes: Record<string, string> = {};
      for (const line of (urls ?? '').split('\n')) {
        const match = /^remote\.(.+)\.url (.+)$/.exec(line);
        if (match?.[1] && match[2]) {
          remotes[match[1]] = match[2];
        }
      }
      if (!branch) {
        return { branch, remotes, upstream: null };
      }
      const [remote, merge] = await Promise.all([
        optional(root, ['config', '--get', `branch.${branch}.remote`]),
        optional(root, ['config', '--get', `branch.${branch}.merge`]),
      ]);
      const upstream =
        remote && merge?.startsWith('refs/heads/')
          ? { remote, branch: merge.slice('refs/heads/'.length) }
          : null;
      return { branch, remotes, upstream };
    },

    async diff(root, compare, options = {}) {
      validateComparison(compare, options);
      if (compare === 'commits') return snapshotDiff(root, options);
      const [branch, from] = await Promise.all([
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        base(root),
      ]);
      const commit = from?.commit ?? EMPTY_TREE;
      const [numstat, raw, added] = await Promise.all([
        git(root, [...DIFF_OPTIONS, '--numstat', commit]),
        git(root, [...DIFF_OPTIONS, '--raw', '--no-abbrev', commit]),
        untracked(root),
      ]);
      const files = toChangedFiles(parseRawDiff(raw), parseNumstat(numstat));
      for (const path of added) {
        files.push(await untrackedFile(root, path));
      }
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { branch, base: from, files };
    },

    async signature(root, compare, options = {}) {
      validateComparison(compare, options);
      if (compare === 'commits') {
        return createHash('sha1')
          .update(JSON.stringify(await selectedSnapshot(root, options.commits ?? [])))
          .digest('hex');
      }
      const [from, head, branch, status] = await Promise.all([
        base(root),
        optional(root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      ]);
      const hash = createHash('sha1').update(
        `${from?.commit ?? ''}\0${head}\0${branch}\0${status}`,
      );
      const entries = status.split('\0').filter(Boolean);
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (!entry) continue;
        const path = entry.slice(3);
        const stats = await lstat(join(root, path)).catch(() => undefined);
        hash.update(`\0${path}:${stats?.mtimeMs ?? '-'}:${stats?.size ?? '-'}`);
        if (entry.slice(0, 2).match(/[RC]/)) index++;
      }
      return hash.digest('hex');
    },

    async readBlob(root, blob, maxBytes) {
      const size = Number((await git(root, ['cat-file', '-s', blob])).trim());
      if (size > maxBytes) {
        return { kind: 'too-large', size };
      }
      try {
        const { stdout } = await runForBuffer('git', [...prefix(root), 'cat-file', 'blob', blob], {
          env: await objectEnvironment(root),
        });
        return classifyBlob(stdout);
      } catch (error) {
        throw toLocalGitError(['cat-file'], error);
      }
    },

    async readFile(root, path, maxBytes) {
      const target = await insideRepository(root, path);
      const info = await lstat(target);
      if (info.isSymbolicLink()) {
        const text = await readlink(target);
        const size = Buffer.byteLength(text);
        return size > maxBytes ? { kind: 'too-large', size } : { kind: 'text', text };
      }
      if (!info.isFile()) {
        throw new AppError('invalid-argument', `${path} is not a file.`);
      }
      if (info.size > maxBytes) {
        return { kind: 'too-large', size: info.size };
      }
      return classifyBlob(await readFile(target));
    },
  };
}

async function untrackedFile(root: string, path: string): Promise<ChangedFile> {
  let additions: number | null = null;
  let kind: ChangedFile['kind'] = 'file';
  try {
    const info = await lstat(join(root, path));
    kind = info.isSymbolicLink() ? 'symlink' : 'file';
    if (info.isFile() && info.size <= LINE_COUNT_LIMIT) {
      const content = classifyBlob(await readFile(join(root, path)));
      if (content.kind === 'text') {
        additions =
          content.text === ''
            ? 0
            : content.text.split('\n').length - (content.text.endsWith('\n') ? 1 : 0);
      }
    }
  } catch {}
  return {
    path,
    status: 'added',
    kind,
    oldBlob: null,
    newBlob: null,
    additions,
    deletions: additions === null ? null : 0,
  };
}

async function insideRepository(root: string, path: string): Promise<string> {
  const target = join(root, path);
  const fromRoot = relative(root, target);
  if (path.includes('\0') || isAbsolute(path) || fromRoot.startsWith('..') || fromRoot === '') {
    throw new AppError('invalid-argument', 'That file is outside the repository.');
  }
  const realRoot = await realpath(root);
  let parent = dirname(target);
  let realParent: string | undefined;
  while (true) {
    try {
      realParent = await realpath(parent);
      break;
    } catch (error) {
      if (
        !['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '') ||
        parent === root ||
        parent === dirname(parent)
      )
        break;
      parent = dirname(parent);
    }
  }
  if (!realParent || (realParent !== realRoot && !realParent.startsWith(realRoot + sep))) {
    throw new AppError('invalid-argument', 'That file is outside the repository.');
  }
  return target;
}

function toLocalGitError(args: readonly string[], error: unknown): AppError {
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
