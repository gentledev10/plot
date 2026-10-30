import type { PullRequestDetail, PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { StatusMessage } from '../../components/StatusMessage';
import styles from './PullRequestView.module.css';
import { usePullRequest } from './queries';

interface PullRequestViewProps {
  target: PullRequestRef;
}

export function PullRequestView({ target }: PullRequestViewProps) {
  const pull = usePullRequest(target);

  if (pull.isPending) {
    return <StatusMessage>Loading {formatPullRequestRef(target)}…</StatusMessage>;
  }
  if (pull.isError) {
    return (
      <StatusMessage
        title={`Could not open ${formatPullRequestRef(target)}`}
        tone="error"
        onRetry={() => void pull.refetch()}
      >
        {pull.error.message}
      </StatusMessage>
    );
  }
  return <PullRequestHeader pull={pull.data} />;
}

function PullRequestHeader({ pull }: { pull: PullRequestDetail }) {
  const { ref } = pull;
  return (
    <section className={styles.view} aria-label={formatPullRequestRef(ref)}>
      <header className={styles.header}>
        <div className={styles.meta}>
          <StateBadge pull={pull} />
          <span>
            {ref.owner}/{ref.repo} #{ref.number}
          </span>
          <a className={styles.external} href={pull.url} target="_blank" rel="noreferrer">
            Open on GitHub <ExternalLink size={12} />
          </a>
        </div>
        <h1 className={styles.title}>{pull.title}</h1>
        <div className={styles.branches}>
          <Avatar user={pull.author} size={18} />
          <span>
            <strong>{pull.author.login}</strong> wants to merge <code>{pull.head.ref}</code> into{' '}
            <code>{pull.base.ref}</code>
          </span>
        </div>
        <div className={styles.stats}>
          <span className={styles.additions}>+{pull.additions}</span>
          <span className={styles.deletions}>−{pull.deletions}</span>
          <span>
            {pull.changedFiles} {pull.changedFiles === 1 ? 'file' : 'files'}
          </span>
        </div>
      </header>
      {pull.body.trim() !== '' && <div className={styles.description}>{pull.body}</div>}
    </section>
  );
}

function StateBadge({ pull }: { pull: PullRequestDetail }) {
  if (pull.state === 'merged') {
    return (
      <span className={styles.badge} data-state="merged">
        <GitMerge size={12} /> Merged
      </span>
    );
  }
  if (pull.state === 'closed') {
    return (
      <span className={styles.badge} data-state="closed">
        <GitPullRequestClosed size={12} /> Closed
      </span>
    );
  }
  return (
    <span className={styles.badge} data-state={pull.isDraft ? 'draft' : 'open'}>
      <GitPullRequest size={12} /> {pull.isDraft ? 'Draft' : 'Open'}
    </span>
  );
}
