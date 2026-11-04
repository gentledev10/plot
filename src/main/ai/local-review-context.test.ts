import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChangedFile } from '@shared/diff';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalReviewContext, LOCAL_REVIEW_LIMITS } from './local-review-context';

it.each([
  '../escape',
  '/absolute',
  '.git/config',
  'src/../../escape',
  'src/.GiT/config',
  'a\\\\b',
  'a\nname',
  'a//b',
  'a/./b',
])('rejects unsafe snapshot paths: %s before reading any source', async (path) => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  let reads = 0;
  await expect(
    createLocalReviewContext({
      root,
      files: [{ ...file, path }],
      readBefore: async () => {
        reads++;
        throw new Error('Unsafe source read');
      },
      readAfter: async () => {
        reads++;
        throw new Error('Unsafe source read');
      },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
  expect(reads).toBe(0);
  expect(await readdir(root)).toEqual([]);
});
it.each(['symlink', 'submodule'] as const)(
  'refuses %s snapshots rather than following repository links',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
    roots.push(root);
    await expect(
      createLocalReviewContext({
        root,
        files: [{ ...file, kind }],
        readBefore: async () => ({ kind: 'text', text: '/outside' }),
        readAfter: async () => ({ kind: 'text', text: '/outside' }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  },
);
it.each(['binary', 'too-large', 'file-bytes', 'total-bytes', 'count', 'aborted'])(
  'bounds snapshot %s and cleans up failures',
  async (failure) => {
    const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
    roots.push(root);
    const controller = new AbortController();
    if (failure === 'aborted') controller.abort();
    const files =
      failure === 'count'
        ? Array.from({ length: LOCAL_REVIEW_LIMITS.files + 1 }, (_, i) => ({
            ...file,
            path: `file-${i}`,
          }))
        : failure === 'total-bytes'
          ? Array.from({ length: 6 }, (_, i) => ({ ...file, path: `file-${i}` }))
          : [file];
    const read = async () =>
      failure === 'binary' || failure === 'too-large'
        ? ({ kind: failure, size: 123 } as const)
        : {
            kind: 'text' as const,
            text: 'x'.repeat(
              failure === 'file-bytes'
                ? LOCAL_REVIEW_LIMITS.fileBytes + 1
                : failure === 'total-bytes'
                  ? LOCAL_REVIEW_LIMITS.fileBytes
                  : 0,
            ),
          };
    await expect(
      createLocalReviewContext({
        root,
        files,
        readBefore: read,
        readAfter: read,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  },
);

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const file: ChangedFile = {
  path: 'src/app.ts',
  kind: 'file',
  status: 'modified',
  oldBlob: 'a'.repeat(40),
  newBlob: null,
  additions: 1,
  deletions: 1,
};
it('creates an isolated selected-file snapshot and real diff without copying source git metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  const context = await createLocalReviewContext({
    root,
    files: [file],
    readBefore: async () => ({ kind: 'text', text: 'before\n' }),
    readAfter: async () => ({ kind: 'text', text: 'after\n' }),
    signal: new AbortController().signal,
  });
  expect(await readFile(join(context.cwd, 'src/app.ts'), 'utf8')).toBe('after\n');
  expect(await readFile(join(context.contextDir, 'pull-request.diff'), 'utf8')).toContain(
    '-before\n+after',
  );
  expect(await readFile(join(context.cwd, '.git/config'), 'utf8')).not.toMatch(/remote|credential/);
  expect(await readdir(join(context.cwd, '.git/hooks')).catch(() => [])).toEqual([]);
  expect(context.lines.get('src/app.ts')).toBe(2);
  await context.dispose();
  expect(await readdir(root)).toEqual([]);
});

it('handles a directory replaced by a file between selected snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  const context = await createLocalReviewContext({
    root,
    files: [
      { ...file, path: 'entry/child.ts', status: 'deleted' },
      { ...file, path: 'entry', status: 'added', oldBlob: null },
    ],
    readBefore: async () => ({ kind: 'text', text: 'old child\n' }),
    readAfter: async () => ({ kind: 'text', text: 'replacement\n' }),
    signal: new AbortController().signal,
  });
  expect(await readFile(join(context.cwd, 'entry'), 'utf8')).toBe('replacement\n');
  expect(await readFile(join(context.contextDir, 'pull-request.diff'), 'utf8')).toContain(
    '+replacement',
  );
  await context.dispose();
});

it('retains both after files in a rename chain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  const files = [
    { ...file, path: 'b.ts', previousPath: 'a.ts', status: 'renamed' as const },
    { ...file, path: 'c.ts', previousPath: 'b.ts', status: 'renamed' as const },
  ];
  const context = await createLocalReviewContext({
    root,
    files,
    readBefore: async (file) => ({ kind: 'text', text: `before ${file.path}\n` }),
    readAfter: async (file) => ({ kind: 'text', text: `after ${file.path}\n` }),
    signal: new AbortController().signal,
  });
  expect(await readFile(join(context.cwd, 'b.ts'), 'utf8')).toBe('after b.ts\n');
  expect(await readFile(join(context.cwd, 'c.ts'), 'utf8')).toBe('after c.ts\n');
  await context.dispose();
});
it('ignores repository ignore rules and attributes when constructing the exact selected diff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  const files = [
    { ...file, path: '.gitignore', status: 'added' as const, oldBlob: null },
    { ...file, path: 'ignored.ts', status: 'added' as const, oldBlob: null },
  ];
  const context = await createLocalReviewContext({
    root,
    files,
    readBefore: async () => ({ kind: 'text', text: '' }),
    readAfter: async (file) => ({
      kind: 'text',
      text: file.path === '.gitignore' ? 'ignored.ts\n' : 'selected code\n',
    }),
    signal: new AbortController().signal,
  });
  expect(await readFile(join(context.contextDir, 'pull-request.diff'), 'utf8')).toContain(
    '+selected code',
  );
  await context.dispose();
});
it('clears inherited Git repository overrides for scratch commands', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-context-test-'));
  roots.push(root);
  vi.stubEnv('GIT_COMMON_DIR', join(root, 'must-not-be-used'));
  try {
    const context = await createLocalReviewContext({
      root,
      files: [file],
      readBefore: async () => ({ kind: 'text', text: 'before\n' }),
      readAfter: async () => ({ kind: 'text', text: 'after\n' }),
      signal: new AbortController().signal,
    });
    expect(await readFile(join(context.contextDir, 'pull-request.diff'), 'utf8')).toContain(
      '+after',
    );
    await context.dispose();
  } finally {
    vi.unstubAllEnvs();
  }
});
