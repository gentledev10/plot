import type { ChangedFile } from '@shared/diff';

export interface DirectoryNode {
  kind: 'directory';
  name: string;
  path: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: 'file';
  name: string;
  file: ChangedFile;
}

export type TreeNode = DirectoryNode | FileNode;

export interface TreeRow {
  id: string;
  node: TreeNode;
  depth: number;
  parentId?: string;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function buildFileTree(files: readonly ChangedFile[]): TreeNode[] {
  const root: DirectoryNode = { kind: 'directory', name: '', path: '', children: [] };
  for (const file of files) {
    const segments = file.path.split('/');
    const fileName = segments.pop() ?? file.path;
    let directory = root;
    for (const segment of segments) {
      const path = directory.path === '' ? segment : `${directory.path}/${segment}`;
      let child = directory.children.find(
        (node): node is DirectoryNode => node.kind === 'directory' && node.name === segment,
      );
      if (!child) {
        child = { kind: 'directory', name: segment, path, children: [] };
        directory.children.push(child);
      }
      directory = child;
    }
    directory.children.push({ kind: 'file', name: fileName, file });
  }
  return root.children.map(compact).sort(compareNodes).map(sortDeep);
}

export function filesInTreeOrder(nodes: readonly TreeNode[]): ChangedFile[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node.file] : filesInTreeOrder(node.children),
  );
}

function rowId(node: TreeNode): string {
  return node.kind === 'file' ? `file:${node.file.path}` : `dir:${node.path}`;
}

export function visibleRows(
  nodes: readonly TreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
  parentId?: string,
): TreeRow[] {
  return nodes.flatMap((node) => {
    const row: TreeRow = { id: rowId(node), node, depth, parentId };
    if (node.kind === 'file' || collapsed.has(node.path)) {
      return [row];
    }
    return [row, ...visibleRows(node.children, collapsed, depth + 1, row.id)];
  });
}

function compact(node: TreeNode): TreeNode {
  if (node.kind === 'file') {
    return node;
  }
  let current = node;
  let name = node.name;
  while (current.children.length === 1 && current.children[0]?.kind === 'directory') {
    current = current.children[0];
    name = `${name}/${current.name}`;
  }
  return { kind: 'directory', name, path: current.path, children: current.children.map(compact) };
}

function sortDeep(node: TreeNode): TreeNode {
  if (node.kind === 'file') {
    return node;
  }
  return { ...node, children: [...node.children].sort(compareNodes).map(sortDeep) };
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'directory' ? -1 : 1;
  }
  return collator.compare(a.name, b.name);
}
