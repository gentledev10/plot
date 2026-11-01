import type { PullRequestRef } from '@shared/github';
import { GITHUB_HOST } from '@shared/hosts';
import type { LocalRepository } from '@shared/local';
import { ChevronsUpDown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { usePreference } from '../../lib/preferences';
import { ConnectGitHub } from '../accounts/ConnectGitHub';
import { useAccounts } from '../accounts/queries';
import { useCommand } from '../keymap/KeymapProvider';
import { LocalRepositoryList } from '../local/LocalRepositoryList';
import { filterPullRequests, newestFirst } from './grouping';
import styles from './InboxPanel.module.css';
import { PullRequestList } from './PullRequestList';
import { PullRequestSearch } from './PullRequestSearch';
import { useInbox } from './queries';

type Section = 'review-requested' | 'authored';

interface InboxPanelProps {
  selected?: PullRequestRef;
  onSelect(ref: PullRequestRef): void;
  focusOpenField?: boolean;
  onOpenFieldFocused?(): void;
  onManageAccounts?(): void;
  selectedLocalId?: string;
  onOpenLocal?(repository: LocalRepository): void;
}

export function InboxPanel({
  selected,
  onSelect,
  focusOpenField,
  onOpenFieldFocused,
  onManageAccounts,
  selectedLocalId,
  onOpenLocal = () => {},
}: InboxPanelProps) {
  const accounts = useAccounts();
  const current = accounts.data?.accounts.find((account) => account.id === accounts.data.currentId);
  const inbox = useInbox(current?.id);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = usePreference<string[]>('inbox.collapsed', [], parseStringList);
  const filtering = query.trim() !== '';
  const reviewRequested = filterPullRequests(inbox.data?.reviewRequested ?? [], query);
  const authored = filterPullRequests(inbox.data?.authored ?? [], query);
  const firstMatch = filtering
    ? (newestFirst(reviewRequested)[0] ?? newestFirst(authored)[0])?.ref
    : undefined;

  function refresh() {
    void accounts.refetch();
    if (current) {
      void inbox.refetch();
    }
  }

  function collapsedIn(section: Section): ReadonlySet<string> {
    const prefix = `${section}/`;
    return new Set(
      collapsed.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)),
    );
  }

  function toggleGroup(section: Section, group: string) {
    const key = `${section}/${group}`;
    setCollapsed(
      collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key],
    );
  }

  useCommand('pullRequest.refresh', refresh);

  return (
    <aside className={styles.panel} aria-label="Pull requests">
      <header className={styles.header}>
        <h2 className={styles.title}>Pull requests</h2>
        <IconButton
          label="Refresh"
          onClick={refresh}
          busy={accounts.isFetching || inbox.isFetching}
        >
          <RefreshCw size={14} />
        </IconButton>
      </header>
      {current && (
        <PullRequestSearch
          query={query}
          onQueryChange={setQuery}
          firstMatch={firstMatch}
          defaultHost={current.host}
          onOpen={onSelect}
          focus={focusOpenField}
          onFocused={onOpenFieldFocused}
        />
      )}
      <div className={styles.content}>
        {renderContent()}
        <LocalRepositoryList selectedId={selectedLocalId} onOpen={onOpenLocal} />
      </div>
      {current && (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.account}
            title="Switch or add accounts"
            onClick={onManageAccounts}
          >
            <Avatar user={current} size={18} />
            <span className={styles.accountName}>{current.login}</span>
            {current.host !== GITHUB_HOST && (
              <span className={styles.accountHost}>{current.host}</span>
            )}
            <ChevronsUpDown size={12} />
          </button>
        </footer>
      )}
    </aside>
  );

  function renderContent() {
    if (accounts.isPending) {
      return <StatusMessage>Loading your accounts…</StatusMessage>;
    }
    if (accounts.isError) {
      return (
        <StatusMessage title="Could not load your accounts" tone="error" onRetry={refresh}>
          {accounts.error.message}
        </StatusMessage>
      );
    }
    if (!current) {
      return (
        <div className={styles.onboarding}>
          <h3 className={styles.onboardingTitle}>Connect GitHub</h3>
          <p className={styles.onboardingText}>
            Plot lists the pull requests waiting for your review and opens any pull request you can
            read.
          </p>
          <ConnectGitHub />
        </div>
      );
    }
    if (inbox.isPending) {
      return <StatusMessage>Loading pull requests…</StatusMessage>;
    }
    if (inbox.isError) {
      return (
        <StatusMessage title="Could not load pull requests" tone="error" onRetry={refresh}>
          {inbox.error.message}
        </StatusMessage>
      );
    }
    return (
      <>
        <PullRequestList
          title="Review requested"
          pulls={reviewRequested}
          emptyText={filtering ? 'No pull requests match.' : 'Nothing is waiting for your review.'}
          selected={selected}
          collapsed={filtering ? NONE : collapsedIn('review-requested')}
          collapsible={!filtering}
          onToggleGroup={(group) => toggleGroup('review-requested', group)}
          onSelect={onSelect}
        />
        <PullRequestList
          title="Your pull requests"
          pulls={authored}
          emptyText={filtering ? 'No pull requests match.' : 'You have no open pull requests.'}
          selected={selected}
          collapsed={filtering ? NONE : collapsedIn('authored')}
          collapsible={!filtering}
          onToggleGroup={(group) => toggleGroup('authored', group)}
          onSelect={onSelect}
        />
      </>
    );
  }
}

const NONE: ReadonlySet<string> = new Set();

function parseStringList(stored: unknown): string[] | undefined {
  return Array.isArray(stored) && stored.every((item) => typeof item === 'string')
    ? stored
    : undefined;
}
