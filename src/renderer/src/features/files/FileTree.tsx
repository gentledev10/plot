import type { ChangedFile } from '@shared/diff';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import styles from './FileTree.module.css';
import { type TreeNode, type TreeRow, visibleRows } from './file-tree';

interface FileTreeProps {
  nodes: readonly TreeNode[];
  selectedPath?: string;
  onSelect(path: string): void;
}
const INDENT = 14;
export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string>();
  const rows = useMemo(() => visibleRows(nodes, collapsed), [nodes, collapsed]);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const selectedId = selectedPath ? `file:${selectedPath}` : undefined;
  const activeId = rows.some((row) => row.id === focusedId)
    ? focusedId
    : (rows.find((row) => row.id === selectedId) ?? rows[0])?.id;
  function setExpanded(path: string, expanded: boolean) {
    const next = new Set(collapsed);
    if (expanded) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setCollapsed(next);
  }
  function focusRow(row: TreeRow | undefined) {
    if (!row) {
      return;
    }
    setFocusedId(row.id);
    rowElements.current.get(row.id)?.focus();
    if (row.node.kind === 'file') {
      onSelect(row.node.file.path);
    }
  }
  function activate(row: TreeRow) {
    if (row.node.kind === 'directory') {
      setExpanded(row.node.path, collapsed.has(row.node.path));
      setFocusedId(row.id);
    } else {
      focusRow(row);
    }
  }
  function onKeyDown(event: KeyboardEvent, row: TreeRow, index: number) {
    const { node } = row;
    const isOpenDirectory = node.kind === 'directory' && !collapsed.has(node.path);
    switch (event.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]);
        break;
      case 'ArrowUp':
        focusRow(rows[index - 1]);
        break;
      case 'Home':
        focusRow(rows[0]);
        break;
      case 'End':
        focusRow(rows[rows.length - 1]);
        break;
      case 'ArrowRight':
        if (node.kind === 'directory' && !isOpenDirectory) {
          setExpanded(node.path, true);
        } else if (isOpenDirectory) {
          focusRow(rows[index + 1]);
        }
        break;
      case 'ArrowLeft':
        if (isOpenDirectory) {
          setExpanded(node.path, false);
        } else {
          focusRow(rows.find((candidate) => candidate.id === row.parentId));
        }
        break;
      case 'Enter':
      case ' ':
        activate(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
  return (
    <div className={styles.tree} role="tree" aria-label={t('Changed files')}>
      {rows.map((row, index) => {
        const { node } = row;
        const isDirectory = node.kind === 'directory';
        const expanded = isDirectory ? !collapsed.has(node.path) : undefined;
        const selected = row.id === selectedId;
        return (
          <div
            key={row.id}
            ref={(element) => {
              if (element) {
                rowElements.current.set(row.id, element);
              } else {
                rowElements.current.delete(row.id);
              }
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={expanded}
            aria-selected={selected}
            tabIndex={row.id === activeId ? 0 : -1}
            className={styles.row}
            style={{
              paddingLeft: 8 + row.depth * INDENT + (isDirectory ? 0 : 12),
            }}
            data-status={isDirectory ? undefined : node.file.status}
            title={isDirectory ? node.path : fileTitle(node.file)}
            onClick={() => activate(row)}
            onKeyDown={(event) => onKeyDown(event, row, index)}
          >
            {isDirectory && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
            {isDirectory ? (
              <Folder size={14} className={styles.icon} />
            ) : (
              <FileText size={14} className={styles.icon} />
            )}
            <span className={styles.name}>{node.name}</span>
            {!isDirectory && <LineCounts file={node.file} />}
          </div>
        );
      })}
    </div>
  );
}
function fileTitle(file: ChangedFile): string {
  return file.previousPath ? `${file.path}\nRenamed from ${file.previousPath}` : file.path;
}
function LineCounts({ file }: { file: ChangedFile }) {
  const t = useT();
  if (file.additions === null || file.deletions === null) {
    return <span className={styles.counts}>{t('binary')}</span>;
  }
  return (
    <span className={styles.counts}>
      {file.additions > 0 && <span className={styles.additions}>+{file.additions}</span>}
      {file.deletions > 0 && <span className={styles.deletions}>−{file.deletions}</span>}
    </span>
  );
}
