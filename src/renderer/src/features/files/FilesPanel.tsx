import type { PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import { ChevronLeft } from 'lucide-react';
import { useMemo } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { usePullRequestDiff } from '../diff/queries';
import styles from './FilesPanel.module.css';
import { FileTree } from './FileTree';
import { buildFileTree, filesInTreeOrder } from './file-tree';

interface FilesPanelProps {
  target: PullRequestRef;
  selectedPath?: string;
  onSelectFile(path: string): void;
  onBack(): void;
}

export function FilesPanel({ target, selectedPath, onSelectFile, onBack }: FilesPanelProps) {
  const diff = usePullRequestDiff(target);
  const tree = useMemo(() => (diff.data ? buildFileTree(diff.data.files) : []), [diff.data]);
  const current = selectedPath ?? filesInTreeOrder(tree)[0]?.path;
  const totals = useMemo(() => {
    const files = diff.data?.files ?? [];
    return {
      additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
      deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    };
  }, [diff.data]);

  return (
    <aside className={styles.panel} aria-label="Changed files">
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack}>
          <ChevronLeft size={14} /> Pull requests
        </button>
      </header>
      <p className={styles.target}>{formatPullRequestRef(target)}</p>
      <div className={styles.content}>{renderContent()}</div>
      {diff.data && (
        <footer className={styles.footer}>
          <span>
            {diff.data.files.length} {diff.data.files.length === 1 ? 'file' : 'files'}
          </span>
          <span className={styles.additions}>+{totals.additions}</span>
          <span className={styles.deletions}>−{totals.deletions}</span>
        </footer>
      )}
    </aside>
  );

  function renderContent() {
    if (diff.isPending) {
      return <StatusMessage>Fetching changes…</StatusMessage>;
    }
    if (diff.isError) {
      return (
        <StatusMessage
          title="Could not load the changes"
          tone="error"
          onRetry={() => void diff.refetch()}
        >
          {diff.error.message}
        </StatusMessage>
      );
    }
    return <FileTree nodes={tree} selectedPath={current} onSelect={onSelectFile} />;
  }
}
