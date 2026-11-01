import type { PullRequestRef, RepositoryRef } from '@shared/github';
import { formatRepositoryRef, repositoryUrl } from '@shared/repository-ref';
import { ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { PullRequestItem } from '../inbox/PullRequestItem';
import { useCommand } from '../keymap/KeymapProvider';
import { useRepositoryPullRequests } from './queries';
import styles from './RepositoryPullsPanel.module.css';

interface RepositoryPullsPanelProps {
  repository: RepositoryRef;
  selected?: PullRequestRef;
  onSelect(ref: PullRequestRef): void;
  onBack(): void;
}

export function RepositoryPullsPanel({
  repository,
  selected,
  onSelect,
  onBack,
}: RepositoryPullsPanelProps) {
  const name = formatRepositoryRef(repository);
  const pulls = useRepositoryPullRequests(repository);
  const items = pulls.data?.pages.flatMap((page) => page.pullRequests) ?? [];

  function refresh() {
    void pulls.refetch();
  }

  useCommand('navigation.refresh', refresh);

  return (
    <aside className={styles.panel} aria-label={name}>
      <header className={styles.header}>
        <IconButton label="Back to pull requests" onClick={onBack}>
          <ChevronLeft size={14} />
        </IconButton>
        <h2 className={styles.title}>{name}</h2>
        <IconButton
          label="Open on GitHub"
          onClick={() => window.open(`${repositoryUrl(repository)}/pulls`, '_blank', 'noreferrer')}
        >
          <ExternalLink size={14} />
        </IconButton>
        <IconButton label="Refresh" onClick={refresh} busy={pulls.isFetching}>
          <RefreshCw size={14} />
        </IconButton>
      </header>
      <div className={styles.content}>{renderContent()}</div>
    </aside>
  );

  function renderContent() {
    if (pulls.isPending) {
      return <StatusMessage>Loading pull requests…</StatusMessage>;
    }
    if (pulls.isError) {
      return (
        <StatusMessage title="Could not load pull requests" tone="error" onRetry={refresh}>
          {pulls.error.message}
        </StatusMessage>
      );
    }
    if (items.length === 0) {
      return <StatusMessage>No open pull requests.</StatusMessage>;
    }
    return (
      <>
        <ul className={styles.list} aria-label={`Open pull requests in ${name}`}>
          {items.map((pull) => (
            <li key={pull.ref.number}>
              <PullRequestItem pull={pull} selected={selected} showAuthor onSelect={onSelect} />
            </li>
          ))}
        </ul>
        {pulls.hasNextPage && (
          <button
            type="button"
            className={styles.more}
            disabled={pulls.isFetchingNextPage}
            onClick={() => void pulls.fetchNextPage()}
          >
            {pulls.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </>
    );
  }
}
