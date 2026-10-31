import type { PullRequestDetail, PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
} from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { StatusMessage } from '../../components/StatusMessage';
import { useCommand } from '../keymap/KeymapProvider';
import styles from './PullRequestHeader.module.css';
import { usePullRequest } from './queries';

interface PullRequestHeaderProps {
  target: PullRequestRef;
}

export function PullRequestHeader({ target }: PullRequestHeaderProps) {
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
  return <Header pull={pull.data} />;
}

function Header({ pull }: { pull: PullRequestDetail }) {
  const [showDescription, setShowDescription] = useState(false);
  const { ref } = pull;
  const hasDescription = pull.body.trim() !== '';
  useCommand('pullRequest.openOnGitHub', () => window.open(pull.url, '_blank', 'noreferrer'));

  return (
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
      <div className={styles.details}>
        <Avatar user={pull.author} size={18} />
        <span>
          <strong>{pull.author.login}</strong> wants to merge <code>{pull.head.ref}</code> into{' '}
          <code>{pull.base.ref}</code>
        </span>
        <span className={styles.stats}>
          <span className={styles.additions}>+{pull.additions}</span>
          <span className={styles.deletions}>−{pull.deletions}</span>
          <span>
            {pull.changedFiles} {pull.changedFiles === 1 ? 'file' : 'files'}
          </span>
        </span>
        {hasDescription && (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={showDescription}
            onClick={() => setShowDescription(!showDescription)}
          >
            {showDescription ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Description
          </button>
        )}
      </div>
      {showDescription && <div className={styles.description}>{pull.body}</div>}
    </header>
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
