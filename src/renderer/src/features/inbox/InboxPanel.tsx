import type { PullRequestRef } from '@shared/github';
import { GITHUB_HOST } from '@shared/hosts';
import { ChevronsUpDown, RefreshCw } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { ConnectGitHub } from '../accounts/ConnectGitHub';
import { useAccounts } from '../accounts/queries';
import { useCommand } from '../keymap/KeymapProvider';
import styles from './InboxPanel.module.css';
import { OpenPullRequestForm } from './OpenPullRequestForm';
import { PullRequestList } from './PullRequestList';
import { useInbox } from './queries';

interface InboxPanelProps {
  selected?: PullRequestRef;
  onSelect(ref: PullRequestRef): void;
  focusOpenField?: boolean;
  onOpenFieldFocused?(): void;
  onManageAccounts?(): void;
}

export function InboxPanel({
  selected,
  onSelect,
  focusOpenField,
  onOpenFieldFocused,
  onManageAccounts,
}: InboxPanelProps) {
  const accounts = useAccounts();
  const current = accounts.data?.accounts.find((account) => account.id === accounts.data.currentId);
  const inbox = useInbox(current?.id);

  function refresh() {
    void accounts.refetch();
    if (current) {
      void inbox.refetch();
    }
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
        <OpenPullRequestForm
          defaultHost={current.host}
          onOpen={onSelect}
          focus={focusOpenField}
          onFocused={onOpenFieldFocused}
        />
      )}
      <div className={styles.content}>{renderContent()}</div>
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
            Viewer lists the pull requests waiting for your review and opens any pull request you
            can read.
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
          pulls={inbox.data.reviewRequested}
          emptyText="Nothing is waiting for your review."
          selected={selected}
          onSelect={onSelect}
        />
        <PullRequestList
          title="Your pull requests"
          pulls={inbox.data.authored}
          emptyText="You have no open pull requests."
          selected={selected}
          onSelect={onSelect}
        />
      </>
    );
  }
}
