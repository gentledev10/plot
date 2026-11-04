import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isolatedGitEnvironment } from '../git/environment';
import { runCommand, runCommandForBuffer } from '../system/process';
import { createLocalGit } from './local-git';

const env = {
  ...isolatedGitEnvironment(process.env),
  GIT_AUTHOR_NAME: 'History Fixture',
  GIT_AUTHOR_EMAIL: 'history@example.com',
  GIT_COMMITTER_NAME: 'History Fixture',
  GIT_COMMITTER_EMAIL: 'history@example.com',
};
const local = createLocalGit({ run: runCommand, runForBuffer: runCommandForBuffer, env });
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function git(root: string, ...args: string[]) {
  return (await runCommand('git', ['-C', root, ...args], { env })).stdout.trim();
}
async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'plot-history-'));
  roots.push(root);
  await git(root, 'init', '-q', '--initial-branch=main');
  return root;
}
async function commit(root: string, path: string, text: string, subject: string) {
  await writeFile(join(root, path), text);
  await git(root, 'add', '-A');
  await git(root, 'commit', '-q', '-m', subject);
  return git(root, 'rev-parse', 'HEAD');
}

describe('local history', () => {
  it.each([
    'file-to-directory',
    'directory-to-file',
    'staged-file-to-directory',
    'staged-directory-to-file',
  ] as const)('snapshots %s replacements without changing the user index', async (change) => {
    const root = await repository();
    if (change.endsWith('file-to-directory')) {
      await commit(root, 'entry', 'before\n', 'File');
      await rm(join(root, 'entry'));
      await mkdir(join(root, 'entry'));
      await writeFile(join(root, 'entry/child.txt'), 'after\n');
    } else {
      await mkdir(join(root, 'entry'));
      await commit(root, 'entry/child.txt', 'before\n', 'Directory');
      await rm(join(root, 'entry'), { recursive: true });
      await writeFile(join(root, 'entry'), 'after\n');
    }
    if (change.startsWith('staged-')) await git(root, 'add', '-A');
    const index = await readFile(join(root, '.git/index'));
    const diff = await local.diff(root, 'uncommitted', { includeUncommitted: true });
    expect(diff.files).toHaveLength(2);
    expect(diff.files.find((file) => file.status === 'added')?.path).toBe(
      change.endsWith('file-to-directory') ? 'entry/child.txt' : 'entry',
    );
    expect(diff.files.find((file) => file.status === 'deleted')?.path).toBe(
      change.endsWith('file-to-directory') ? 'entry' : 'entry/child.txt',
    );
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
  });

  it('preserves tracked files outside a sparse checkout in uncommitted snapshots', async () => {
    const root = await repository();
    await mkdir(join(root, 'visible'));
    await mkdir(join(root, 'omitted'));
    await commit(root, 'visible/file.txt', 'visible\n', 'Visible');
    await commit(root, 'omitted/file.txt', 'omitted\n', 'Omitted');
    await git(root, 'sparse-checkout', 'set', '--cone', 'visible');
    await writeFile(join(root, 'visible/file.txt'), 'edited\n');
    const index = await readFile(join(root, '.git/index'));
    const diff = await local.diff(root, 'uncommitted', { includeUncommitted: true });
    expect(diff.files.map((file) => file.path)).toEqual(['visible/file.txt']);
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    await expect(readFile(join(root, 'omitted/file.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('snapshots deleted nested directories without reading outside the repository', async () => {
    const root = await repository();
    await mkdir(join(root, 'nested'));
    await commit(root, 'nested/file.txt', 'inside\n', 'Nested root');
    await rm(join(root, 'nested'), { recursive: true });
    const diff = await local.diff(root, 'branch', { headRef: 'HEAD', includeUncommitted: true });
    expect(diff.files).toMatchObject([
      { path: 'nested/file.txt', status: 'deleted', newBlob: null },
    ]);
  });

  it('rejects symlinked parents while safely snapshotting a symlink itself', async () => {
    const root = await repository();
    const outside = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    await mkdir(join(root, 'nested'));
    await commit(root, 'nested/file.txt', 'inside\n', 'Nested');
    await writeFile(join(outside, 'file.txt'), 'secret\n');
    await rm(join(root, 'nested'), { recursive: true });
    await symlink(outside, join(root, 'nested'));
    await expect(
      local.diff(root, 'branch', { headRef: 'HEAD', includeUncommitted: true }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await rm(join(root, 'nested'));
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested/file.txt'), 'inside\n');
    await symlink(join(outside, 'file.txt'), join(root, 'link'));
    const diff = await local.diff(root, 'branch', {
      baseRef: 'HEAD',
      headRef: 'HEAD',
      includeUncommitted: true,
    });
    const link = diff.files.find((file) => file.path === 'link');
    expect(link?.kind).toBe('symlink');
    await expect(local.readBlob(root, link?.newBlob ?? '', 1000)).resolves.toEqual({
      kind: 'text',
      text: join(outside, 'file.txt'),
    });
  });

  it('prefers explicit local branch refs over an identically named tag', async () => {
    const root = await repository();
    const first = await commit(root, 'base.txt', 'base\n', 'Base');
    await git(root, 'tag', 'feature');
    await git(root, 'switch', '-q', '-c', 'feature');
    const latest = await commit(root, 'feature.txt', 'feature\n', 'Feature');
    expect((await local.history(root, 'feature')).commits[0]?.sha).toBe(latest);
    const diff = await local.diff(root, 'branch', { baseRef: first, headRef: 'feature' });
    expect(diff.files.map((file) => file.path)).toEqual(['feature.txt']);
  });

  it('does not read unchanged oversized files when capturing a small dirty diff', async () => {
    const root = await repository();
    await commit(root, 'large.txt', 'x'.repeat(1001), 'Large unchanged file');
    await commit(root, 'small.txt', 'before\n', 'Small file');
    await writeFile(join(root, 'small.txt'), 'after\n');
    const bounded = createLocalGit({
      run: runCommand,
      runForBuffer: runCommandForBuffer,
      env,
      maxSnapshotCacheBytes: 1000,
    });
    const diff = await bounded.diff(root, 'branch', { baseRef: 'main', includeUncommitted: true });
    expect(diff.files.map((file) => file.path)).toEqual(['small.txt']);
    expect(await bounded.readBlob(root, diff.files[0]?.newBlob ?? '', 100)).toEqual({
      kind: 'text',
      text: 'after\n',
    });
  });

  it('rejects oversized snapshot inputs before compression can hide their size', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    const bounded = createLocalGit({
      run: runCommand,
      runForBuffer: runCommandForBuffer,
      env,
      maxSnapshotCacheBytes: 1000,
    });
    await writeFile(join(root, 'base.txt'), 'x'.repeat(1001));
    await expect(
      bounded.diff(root, 'uncommitted', { includeUncommitted: true }),
    ).rejects.toMatchObject({
      code: 'git-failed',
      message: expect.stringContaining('size limit'),
    });
  });

  it('applies the requested read size limit to symbolic link targets', async () => {
    const root = await repository();
    await symlink('long-target-name', join(root, 'link'));
    await expect(local.readFile(root, 'link', 4)).resolves.toEqual({ kind: 'too-large', size: 16 });
  });

  it('rejects snapshots beyond the bounded object cache without evicting older blobs', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    const bounded = createLocalGit({
      run: runCommand,
      runForBuffer: runCommandForBuffer,
      env,
      maxSnapshotCacheBytes: 1000,
    });
    await writeFile(join(root, 'base.txt'), 'small\n');
    const options = { headRef: 'HEAD', includeUncommitted: true };
    const first = await bounded.diff(root, 'branch', options);
    await writeFile(
      join(root, 'base.txt'),
      Array.from({ length: 10000 }, (_, index) => `${index} unique content`).join('\n'),
    );
    await expect(bounded.diff(root, 'branch', options)).rejects.toMatchObject({
      code: 'git-failed',
      message: expect.stringContaining('cache'),
    });
    await expect(bounded.readBlob(root, first.files[0]?.newBlob ?? '', 1000)).resolves.toEqual({
      kind: 'text',
      text: 'small\n',
    });
  });

  it('supports explicitly requested uncommitted snapshots with no branch options', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    await git(root, 'switch', '-q', '-c', 'feature');
    await commit(root, 'feature.txt', 'feature\n', 'Feature');
    await writeFile(join(root, 'base.txt'), 'dirty\n');
    const diff = await local.diff(root, 'uncommitted', { includeUncommitted: true });
    expect(diff.files.map((file) => file.path)).toEqual(['base.txt']);
    expect(diff.files[0]?.newBlob).toMatch(/^[0-9a-f]{40}$/);
  });

  it('does not invoke repository hooks or clean filters while snapshotting', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    const marker = join(root, 'executed');
    const hooks = join(root, 'hooks');
    await mkdir(hooks);
    await writeFile(join(hooks, 'post-index-change'), `#!/bin/sh\ntouch '${marker}'\n`, {
      mode: 0o755,
    });
    await git(root, 'config', 'core.hooksPath', hooks);
    await git(root, 'config', 'filter.attack.clean', `touch '${marker}'`);
    await writeFile(join(root, '.gitattributes'), '*.txt filter=attack\n');
    await writeFile(join(root, 'base.txt'), 'dirty\n');
    await local.diff(root, 'branch', { headRef: 'HEAD', includeUncommitted: true });
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('handles empty repositories and distinguishes invalid refs from an unborn HEAD', async () => {
    const root = await repository();
    expect(await local.history(root)).toEqual({ branches: [], commits: [], hasMore: false });
    await expect(local.history(root, 'missing')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(local.history(root, '--help')).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('reports hasMore only when more than 100 commits exist', async () => {
    const root = await repository();
    let head = await commit(root, 'base.txt', 'base\n', 'Base');
    const tree = await git(root, 'rev-parse', 'HEAD^{tree}');
    for (let i = 1; i < 100; i++)
      head = await git(root, 'commit-tree', tree, '-p', head, '-m', `Commit ${i}`);
    await git(root, 'update-ref', 'HEAD', head);
    const exact = await local.history(root);
    expect(exact.commits).toHaveLength(100);
    expect(exact.hasMore).toBe(false);
    await git(root, 'commit', '-q', '--allow-empty', '-m', 'Extra');
    const more = await local.history(root);
    expect(more.commits).toHaveLength(100);
    expect(more.hasMore).toBe(true);
    expect(more.commits[0]?.subject).toBe('Extra');
  }, 15_000);

  it('diffs root commits and preserves renames in selected commits', async () => {
    const root = await repository();
    const first = await commit(root, 'old.txt', 'rename me\n', 'Root');
    const initial = await local.diff(root, 'commits', { commits: [first] });
    expect(initial.files).toMatchObject([{ path: 'old.txt', status: 'added' }]);
    await git(root, 'mv', 'old.txt', 'new.txt');
    await git(root, 'commit', '-q', '-m', 'Rename');
    const rename = await git(root, 'rev-parse', 'HEAD');
    const diff = await local.diff(root, 'commits', { commits: [rename] });
    expect(diff.files).toMatchObject([
      { path: 'new.txt', previousPath: 'old.txt', status: 'renamed' },
    ]);
  });

  it('uses a merge commits first parent as its explicit baseline', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Root');
    await git(root, 'switch', '-q', '-c', 'side');
    await commit(root, 'side.txt', 'side\n', 'Side');
    await git(root, 'switch', '-q', 'main');
    await commit(root, 'main.txt', 'main\n', 'Main');
    await git(root, 'merge', '-q', '--no-ff', 'side', '-m', 'Merge');
    const sha = await git(root, 'rev-parse', 'HEAD');
    const diff = await local.diff(root, 'commits', { commits: [sha] });
    expect(diff.files.map((file) => file.path)).toEqual(['side.txt']);
    expect((await local.history(root)).commits[0]?.parents).toHaveLength(2);
  });

  it('fails clearly on selected patches that depend on excluded commits without changing user state', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Root');
    const first = await commit(root, 'first.txt', 'first\n', 'First');
    await commit(root, 'dependency.txt', 'dependency\n', 'Excluded dependency');
    const last = await commit(root, 'dependency.txt', 'requires dependency\n', 'Dependent');
    await writeFile(join(root, 'base.txt'), 'dirty\n');
    const index = await readFile(join(root, '.git/index'));
    const objects = await git(root, 'count-objects', '-v');
    await expect(local.diff(root, 'commits', { commits: [first, last] })).rejects.toMatchObject({
      code: 'git-failed',
      message: expect.stringContaining('conflict'),
    });
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    expect(await readFile(join(root, 'base.txt'), 'utf8')).toBe('dirty\n');
    expect(await git(root, 'count-objects', '-v')).toBe(objects);
  });

  it('does not add snapshot objects to the user repository', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    const before = await git(root, 'count-objects', '-v');
    await writeFile(join(root, 'base.txt'), 'snapshot only\n');
    const diff = await local.diff(root, 'branch', {
      baseRef: 'main',
      headRef: 'HEAD',
      includeUncommitted: true,
    });
    expect(await git(root, 'count-objects', '-v')).toBe(before);
    await expect(local.readBlob(root, diff.files[0]?.newBlob ?? '', 1000)).resolves.toEqual({
      kind: 'text',
      text: 'snapshot only\n',
    });
  });

  it('includes uncommitted snapshots only when head resolves to current HEAD', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    await git(root, 'switch', '-q', '-c', 'feature');
    await commit(root, 'feature.txt', 'committed\n', 'Feature');
    await writeFile(join(root, 'feature.txt'), 'dirty\n');
    await writeFile(join(root, 'untracked.txt'), 'untracked\n');
    const index = await readFile(join(root, '.git/index'));
    const options = { baseRef: 'main', headRef: 'feature', includeUncommitted: true };
    const diff = await local.diff(root, 'branch', options);
    expect(diff.files.map((file) => file.path)).toEqual(['feature.txt', 'untracked.txt']);
    await expect(local.readBlob(root, diff.files[0]?.newBlob ?? '', 1000)).resolves.toEqual({
      kind: 'text',
      text: 'dirty\n',
    });
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    const before = await local.signature(root, 'branch', options);
    await writeFile(join(root, 'feature.txt'), 'changed\n');
    expect(await local.signature(root, 'branch', options)).not.toBe(before);
    await expect(local.diff(root, 'branch', { ...options, headRef: 'main' })).rejects.toMatchObject(
      { code: 'invalid-argument' },
    );
  });

  it('replays only selected commits in ancestry order into an isolated index', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    const first = await commit(root, 'first.txt', 'first\n', 'First selected');
    await commit(root, 'excluded.txt', 'excluded\n', 'Not selected');
    const last = await commit(root, 'last.txt', 'last\n', 'Last selected');
    await writeFile(join(root, 'base.txt'), 'dirty\n');
    await writeFile(join(root, 'staged.txt'), 'staged\n');
    await git(root, 'add', 'staged.txt');
    const index = await readFile(join(root, '.git/index'));
    const status = await git(root, 'status', '--porcelain');
    const diff = await local.diff(root, 'commits', { commits: [last, first] });
    expect(diff.files.map((file) => file.path)).toEqual(['first.txt', 'last.txt']);
    for (const file of diff.files) {
      expect(file.newBlob).toMatch(/^[0-9a-f]{40}$/);
      expect((await local.readBlob(root, file.newBlob ?? '', 1000)).kind).toBe('text');
    }
    expect(await git(root, 'status', '--porcelain')).toBe(status);
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    expect(await readFile(join(root, 'base.txt'), 'utf8')).toBe('dirty\n');
    expect(await git(root, 'rev-parse', 'HEAD')).toBe(last);
  });

  it('derives the automatic branch baseline from the selected head instead of checked-out HEAD', async () => {
    const root = await repository();
    const common = await commit(root, 'base.txt', 'base\n', 'Base');
    await git(root, 'switch', '-q', '-c', 'other');
    await commit(root, 'other.txt', 'other\n', 'Other');
    await git(root, 'switch', '-q', 'main');
    await commit(root, 'later-main.txt', 'later main\n', 'Advance main');
    await git(root, 'switch', '-q', '-c', 'checked-out');
    await commit(root, 'checked-out.txt', 'checked out\n', 'Checked out');
    const diff = await local.diff(root, 'branch', { headRef: 'other', includeUncommitted: false });
    expect(diff.files.map((file) => file.path)).toEqual(['other.txt']);
    expect(diff.base).toEqual({ name: 'main', commit: common });
    const uncommitted = await local.diff(root, 'uncommitted', {
      headRef: 'other',
      includeUncommitted: false,
    });
    expect(uncommitted.files).toEqual([]);
    expect(uncommitted.base?.name).toBe('other');
  });

  it('compares arbitrary refs without checking out or including dirty files and keeps snapshot blobs stable', async () => {
    const root = await repository();
    await commit(root, 'base.txt', 'base\n', 'Base');
    await git(root, 'switch', '-q', '-c', 'feature');
    await commit(root, 'feature.txt', 'committed\n', 'Feature');
    await writeFile(join(root, 'feature.txt'), 'dirty\n');
    await writeFile(join(root, 'untracked.txt'), 'untracked\n');
    const index = await readFile(join(root, '.git/index'));
    const options = { baseRef: 'main', headRef: 'feature', includeUncommitted: false };
    const diff = await local.diff(root, 'branch', options);
    expect(diff.files.map((file) => file.path)).toEqual(['feature.txt']);
    const blob = diff.files[0]?.newBlob;
    expect(blob).toMatch(/^[0-9a-f]{40}$/);
    await expect(local.readBlob(root, blob ?? '', 1000)).resolves.toEqual({
      kind: 'text',
      text: 'committed\n',
    });
    const signature = await local.signature(root, 'branch', options);
    await writeFile(join(root, 'feature.txt'), 'dirtier\n');
    expect(await local.signature(root, 'branch', options)).toBe(signature);
    expect(await git(root, 'branch', '--show-current')).toBe('feature');
    expect(await readFile(join(root, '.git/index'))).toEqual(index);
    expect(await readFile(join(root, 'feature.txt'), 'utf8')).toBe('dirtier\n');
  });

  it('lists local and remote branches and structured commits for the requested ref', async () => {
    const root = await repository();
    const first = await commit(root, 'base.txt', 'base\n', 'Initial subject');
    await git(root, 'switch', '-q', '-c', 'feature');
    await commit(root, 'feature.txt', 'feature\n', 'Feature subject');
    await git(root, 'update-ref', 'refs/remotes/origin/main', first);
    const history = await local.history(root, 'main');
    expect(history.branches).toEqual([
      { name: 'feature', current: true, remote: false },
      { name: 'main', current: false, remote: false },
      { name: 'origin/main', current: false, remote: true },
    ]);
    expect(history.commits).toEqual([
      {
        sha: first,
        parents: [],
        subject: 'Initial subject',
        author: 'History Fixture',
        date: expect.any(String),
      },
    ]);
    expect(history.hasMore).toBe(false);
  });
});
