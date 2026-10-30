import type { PullRequestRef } from '@shared/github';
import { RefreshCw } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import styles from './InboxPanel.module.css';
import { OpenPullRequestForm } from './OpenPullRequestForm';
import { PullRequestList } from './PullRequestList';
import { useInbox, useSession } from './queries';

interface InboxPanelProps {
  selected?: PullRequestRef;
  onSelect(ref: PullRequestRef): void;
}

export function InboxPanel({ selected, onSelect }: InboxPanelProps) {
  const session = useSession();
  const user = session.data?.status === 'signed-in' ? session.data.user : undefined;
  const inbox = useInbox(user !== undefined);

  function refresh() {
    void session.refetch();
    if (user) {
      void inbox.refetch();
    }
  }

  return (
    <aside className={styles.panel} aria-label="Pull requests">
      <header className={styles.header}>
        <h2 className={styles.title}>Pull requests</h2>
        <IconButton label="Refresh" onClick={refresh} busy={session.isFetching || inbox.isFetching}>
          <RefreshCw size={14} />
        </IconButton>
      </header>
      <OpenPullRequestForm onOpen={onSelect} />
      <div className={styles.content}>{renderContent()}</div>
      {user && (
        <footer className={styles.footer}>
          <Avatar user={user} size={18} />
          <span>{user.login}</span>
        </footer>
      )}
    </aside>
  );

  function renderContent() {
    if (session.isPending) {
      return <StatusMessage>Connecting to GitHub…</StatusMessage>;
    }
    if (session.isError) {
      return (
        <StatusMessage title="Could not check your GitHub sign-in" tone="error" onRetry={refresh}>
          {session.error.message}
        </StatusMessage>
      );
    }
    if (session.data.status === 'gh-not-installed') {
      return (
        <StatusMessage title="Install the GitHub CLI" onRetry={refresh}>
          <p>
            Viewer signs in through the GitHub CLI. Install it from{' '}
            <a href="https://cli.github.com" target="_blank" rel="noreferrer">
              cli.github.com
            </a>
            , run <code>gh auth login</code>, then try again.
          </p>
        </StatusMessage>
      );
    }
    if (session.data.status === 'signed-out') {
      return (
        <StatusMessage title="Sign in to GitHub" onRetry={refresh}>
          <p>
            Run <code>gh auth login</code> in a terminal, then try again.
          </p>
        </StatusMessage>
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
