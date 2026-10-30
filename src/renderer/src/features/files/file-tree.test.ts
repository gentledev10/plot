import type { ChangedFile } from '@shared/diff';
import { describe, expect, it } from 'vitest';
import { buildFileTree, filesInTreeOrder, type TreeNode, visibleRows } from './file-tree';

function file(path: string): ChangedFile {
  return {
    path,
    status: 'modified',
    kind: 'file',
    oldBlob: 'a'.repeat(40),
    newBlob: 'b'.repeat(40),
    additions: 1,
    deletions: 1,
  };
}

function shape(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'file' ? node.name : { [node.name]: shape(node.children) },
  );
}

describe('buildFileTree', () => {
  it('groups files by directory', () => {
    const tree = buildFileTree([file('src/app.ts'), file('src/util.ts'), file('README.md')]);
    expect(shape(tree)).toEqual([{ src: ['app.ts', 'util.ts'] }, 'README.md']);
  });

  it('compacts directories that only contain one directory, like IntelliJ', () => {
    const tree = buildFileTree([
      file('src/main/kotlin/com/acme/user/UserService.kt'),
      file('src/main/kotlin/com/acme/user/UserRepository.kt'),
      file('src/main/kotlin/com/acme/post/PostService.kt'),
    ]);
    expect(shape(tree)).toEqual([
      {
        'src/main/kotlin/com/acme': [
          { post: ['PostService.kt'] },
          { user: ['UserRepository.kt', 'UserService.kt'] },
        ],
      },
    ]);
  });

  it('keeps the full path on compacted directories', () => {
    const [node] = buildFileTree([file('a/b/c/one.ts'), file('a/b/c/two.ts')]);
    expect(node).toMatchObject({ kind: 'directory', name: 'a/b/c', path: 'a/b/c' });
  });

  it('sorts directories first, then names in natural order', () => {
    const tree = buildFileTree([
      file('z.ts'),
      file('lib/b.ts'),
      file('file10.ts'),
      file('file2.ts'),
      file('docs/a.md'),
    ]);
    expect(shape(tree)).toEqual([
      { docs: ['a.md'] },
      { lib: ['b.ts'] },
      'file2.ts',
      'file10.ts',
      'z.ts',
    ]);
  });

  it('handles an empty change list', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe('filesInTreeOrder', () => {
  it('lists files in the order the tree shows them', () => {
    const tree = buildFileTree([
      file('README.md'),
      file('src/b.ts'),
      file('src/a.ts'),
      file('docs/guide.md'),
    ]);
    expect(filesInTreeOrder(tree).map((f) => f.path)).toEqual([
      'docs/guide.md',
      'src/a.ts',
      'src/b.ts',
      'README.md',
    ]);
  });
});

describe('visibleRows', () => {
  const tree = buildFileTree([file('src/app.ts'), file('src/lib/util.ts'), file('README.md')]);

  it('flattens the tree with depth and parent', () => {
    expect(
      visibleRows(tree, new Set()).map(({ id, depth, parentId }) => [id, depth, parentId]),
    ).toEqual([
      ['dir:src', 0, undefined],
      ['dir:src/lib', 1, 'dir:src'],
      ['file:src/lib/util.ts', 2, 'dir:src/lib'],
      ['file:src/app.ts', 1, 'dir:src'],
      ['file:README.md', 0, undefined],
    ]);
  });

  it('hides the children of collapsed directories', () => {
    expect(visibleRows(tree, new Set(['src'])).map((row) => row.id)).toEqual([
      'dir:src',
      'file:README.md',
    ]);
  });
});
