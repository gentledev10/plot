import { createHash } from 'node:crypto';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import type { LocalCompare, LocalDiff, LocalStatus } from '@shared/local';
import { AppError } from '../errors';
import { classifyBlob, parseNumstat, parseRawDiff, toChangedFiles } from '../git/parse';
import { type BufferCommandRunner, CommandError, type CommandRunner } from '../system/process';

// Git's well-known id of the empty tree, used as the base of a repository with no commits yet.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const BASE_CANDIDATES = ['main', 'master', 'origin/main', 'origin/master'];
const DIFF_OPTIONS = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-z'];
const LINE_COUNT_LIMIT = 1024 * 1024;

export interface LocalTracking {
  branch: string | null;
  remotes: Record<string, string>;
  upstream: { remote: string; branch: string } | null;
}

export interface LocalGit {
  topLevel(path: string): Promise<string>;
  status(root: string): Promise<LocalStatus>;
  tracking(root: string): Promise<LocalTracking>;
  diff(root: string, compare: LocalCompare): Promise<LocalDiff>;
  signature(root: string, compare: LocalCompare): Promise<string>;
  readBlob(root: string, blob: string, maxBytes: number): Promise<BlobContent>;
  readFile(root: string, path: string, maxBytes: number): Promise<BlobContent>;
}

interface LocalGitOptions {
  run: CommandRunner;
  runForBuffer: BufferCommandRunner;
  env: NodeJS.ProcessEnv;
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

export function createLocalGit({ run, runForBuffer, env }: LocalGitOptions): LocalGit {
  const environment = localGitEnvironment(env);
  const prefix = (root: string) => ['-C', root, '-c', 'core.fsmonitor=false'];

  async function git(root: string, args: readonly string[]): Promise<string> {
    try {
      return (await run('git', [...prefix(root), ...args], { env: environment })).stdout;
    } catch (error) {
      throw toLocalGitError(args, error);
    }
  }

  async function optional(root: string, args: readonly string[]): Promise<string | null> {
    try {
      const output = (await run('git', [...prefix(root), ...args], { env: environment })).stdout;
      return output.trim() || null;
    } catch (error) {
      if (error instanceof CommandError && error.failure === 'exit') {
        return null;
      }
      throw toLocalGitError(args, error);
    }
  }

  async function base(root: string, compare: LocalCompare): Promise<LocalDiff['base']> {
    const head = await optional(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    if (!head) {
      return null;
    }
    if (compare === 'uncommitted') {
      return { name: 'HEAD', commit: head };
    }
    const name =
      (await optional(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])) ??
      (await firstExisting(root, BASE_CANDIDATES));
    if (!name) {
      return { name: 'HEAD', commit: head };
    }
    const commit = await optional(root, ['merge-base', name, 'HEAD']);
    return commit ? { name, commit } : { name: 'HEAD', commit: head };
  }

  async function firstExisting(root: string, names: readonly string[]): Promise<string | null> {
    for (const name of names) {
      if (await optional(root, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`])) {
        return name;
      }
    }
    return null;
  }

  async function untracked(root: string): Promise<string[]> {
    const output = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
    return output.split('\0').filter(Boolean);
  }

  return {
    async topLevel(path) {
      const top = await optional(path, ['rev-parse', '--show-toplevel']);
      if (!top) {
        throw new AppError('not-a-repository', 'That folder is not inside a git repository.');
      }
      return top;
    },

    // Counts the files a branch diff lists without comparing their lines.
    async status(root) {
      const [branch, from, added] = await Promise.all([
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        base(root, 'branch'),
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

    async diff(root, compare) {
      const [branch, from] = await Promise.all([
        optional(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        base(root, compare),
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

    async signature(root, compare) {
      const [from, head, branch, status] = await Promise.all([
        base(root, compare),
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
          env: environment,
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
        return { kind: 'text', text: await readlink(target) };
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
  const [realRoot, realParent] = await Promise.all([
    realpath(root),
    realpath(join(target, '..')).catch(() => undefined),
  ]);
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
