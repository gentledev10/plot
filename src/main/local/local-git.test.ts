import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedGitEnvironment } from '../git/environment';
import { runCommand, runCommandForBuffer } from '../system/process';
import { createLocalGit, localGitEnvironment } from './local-git';

const fixtureEnv = {
  ...isolatedGitEnvironment(process.env),
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
};

let root: string;
let repo: string;
let outside: string;
const local = createLocalGit({
  run: runCommand,
  runForBuffer: runCommandForBuffer,
  env: process.env,
});

async function git(dir: string, ...args: string[]) {
  return (await runCommand('git', ['-C', dir, ...args], { env: fixtureEnv })).stdout.trim();
}

async function write(dir: string, files: Record<string, string | null>) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path);
    if (content === null) {
      await rm(target);
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'plot-local-')));
  repo = join(root, 'repo');
  outside = join(root, 'outside');
  await mkdir(repo);
  await write(outside, { 'secret.txt': 'do not read\n' });

  await git(repo, 'init', '--quiet', '--initial-branch=main');
  await write(repo, {
    '.gitignore': '*.log\n',
    'README.md': '# Local\n',
    'src/app.ts': 'export const greeting = "hello";\n',
    'src/old.ts': 'export const old = true;\n',
  });
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '--quiet', '-m', 'Initial commit');

  await git(repo, 'switch', '--quiet', '-c', 'feature');
  await write(repo, {
    'src/app.ts': 'export const greeting = "hello, world";\n',
    'src/new.ts': 'export const fresh = true;\n',
  });
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '--quiet', '-m', 'Feature work');

  await write(repo, {
    'src/app.ts': 'export const greeting = "hello, everyone";\n',
    'src/old.ts': null,
    'notes.md': 'one\ntwo\nthree\n',
    'debug.log': 'ignored\n',
  });
  await symlink(join(outside, 'secret.txt'), join(repo, 'secret-link'));
  await symlink(outside, join(repo, 'outside-dir'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const summary = (files: { path: string; status: string }[]) =>
  files.map((file) => `${file.status} ${file.path}`);

describe('createLocalGit', () => {
  it('finds the top of the repository from any folder inside it', async () => {
    await expect(local.topLevel(join(repo, 'src'))).resolves.toBe(repo);
    await expect(local.topLevel(outside)).rejects.toMatchObject({ code: 'not-a-repository' });
  });

  it('counts the files an uncommitted diff lists, with the branch name', async () => {
    const diff = await local.diff(repo, 'uncommitted');
    await expect(local.status(repo)).resolves.toEqual({
      branch: 'feature',
      changedFiles: diff.files.length,
    });
  });

  it('reads the remotes and the branch the current branch tracks', async () => {
    const clone = join(root, 'clone');
    await mkdir(clone);
    await git(clone, 'init', '--quiet', '--initial-branch=main');
    await git(clone, 'remote', 'add', 'origin', 'git@github.com:me/api.git');
    await git(clone, 'remote', 'add', 'upstream', 'https://github.com/acme/api.git');
    await git(clone, 'switch', '--quiet', '-c', 'retry-webhooks');
    await git(clone, 'config', 'branch.retry-webhooks.remote', 'origin');
    await git(clone, 'config', 'branch.retry-webhooks.merge', 'refs/heads/webhooks/retry');

    await expect(local.tracking(clone)).resolves.toEqual({
      branch: 'retry-webhooks',
      remotes: { origin: 'git@github.com:me/api.git', upstream: 'https://github.com/acme/api.git' },
      upstream: { remote: 'origin', branch: 'webhooks/retry' },
    });
    await expect(local.tracking(repo)).resolves.toEqual({
      branch: 'feature',
      remotes: {},
      upstream: null,
    });
  });

  it('shows only uncommitted work when asked', async () => {
    const diff = await local.diff(repo, 'uncommitted');
    expect(diff.base?.name).toBe('HEAD');
    expect(diff.files.find((file) => file.path === 'notes.md')).toMatchObject({
      additions: 3,
      deletions: 0,
    });
    expect(summary(diff.files)).not.toContain('added src/new.ts');
    expect(summary(diff.files)).toContain('modified src/app.ts');
  });

  it('reads the base version from git and the current version from disk', async () => {
    const diff = await local.diff(repo, 'uncommitted');
    const app = diff.files.find((file) => file.path === 'src/app.ts');

    await expect(local.readBlob(repo, app?.oldBlob ?? '', 1_000)).resolves.toEqual({
      kind: 'text',
      text: 'export const greeting = "hello, world";\n',
    });
    await expect(local.readFile(repo, 'src/app.ts', 1_000)).resolves.toEqual({
      kind: 'text',
      text: 'export const greeting = "hello, everyone";\n',
    });
    await expect(local.readFile(repo, 'notes.md', 4)).resolves.toEqual({
      kind: 'too-large',
      size: 14,
    });
  });

  it('never reads files outside the repository', async () => {
    await expect(local.readFile(repo, '../outside/secret.txt', 1_000)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(local.readFile(repo, 'outside-dir/secret.txt', 1_000)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(local.readFile(repo, 'secret-link', 1_000)).resolves.toEqual({
      kind: 'text',
      text: join(outside, 'secret.txt'),
    });
  });

  it('changes its signature when a changed file is edited again', async () => {
    const before = await local.signature(repo, 'uncommitted');
    expect(await local.signature(repo, 'uncommitted')).toBe(before);

    await write(repo, { 'src/app.ts': 'export const greeting = "hello, everyone and more";\n' });
    expect(await local.signature(repo, 'uncommitted')).not.toBe(before);
  });

  it('works in a repository without commits yet', async () => {
    const empty = join(root, 'empty');
    await mkdir(empty);
    await git(empty, 'init', '--quiet');
    await write(empty, { 'first.txt': 'first\n' });

    const diff = await local.diff(empty, 'uncommitted');
    expect(diff.base).toBeNull();
    expect(summary(diff.files)).toEqual(['added first.txt']);
    expect((await local.status(empty)).changedFiles).toBe(1);
  });

  it('detects edits inside an existing untracked directory', async () => {
    await write(repo, { 'untracked/nested/note.txt': 'before\n' });
    const before = await local.signature(repo, 'uncommitted');
    await write(repo, { 'untracked/nested/note.txt': 'after editing the same file\n' });
    expect(await local.signature(repo, 'uncommitted')).not.toBe(before);
  });

  it('detects new commits and branch switches even with a clean working tree', async () => {
    const clean = join(root, 'clean');
    await mkdir(clean);
    await git(clean, 'init', '--quiet', '--initial-branch=main');
    await write(clean, { 'first.txt': 'base\n' });
    await git(clean, 'add', '.');
    await git(clean, 'commit', '--quiet', '-m', 'Base');
    await git(clean, 'switch', '--quiet', '-c', 'feature');
    const before = await local.signature(clean, 'uncommitted');
    await write(clean, { 'second.txt': 'new commit\n' });
    await git(clean, 'add', '.');
    await git(clean, 'commit', '--quiet', '-m', 'More work');
    const committed = await local.signature(clean, 'uncommitted');
    expect(committed).not.toBe(before);
    await git(clean, 'switch', '--quiet', '-c', 'another-name');
    expect(await local.signature(clean, 'uncommitted')).not.toBe(committed);
  });
});

describe('localGitEnvironment', () => {
  it('drops variables that would point git at another repository', () => {
    const env = localGitEnvironment({ GIT_DIR: '/x', GIT_WORK_TREE: '/y', HOME: '/home/me' });
    expect(env).toMatchObject({ HOME: '/home/me', GIT_OPTIONAL_LOCKS: '0' });
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
  });
});
