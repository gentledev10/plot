import type { PullRequestRef, PullRequestSummary } from '@shared/github';
import { isSamePullRequest } from '@shared/pull-request-ref';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { formatRelativeTime } from '../../lib/format';
import styles from './InboxPanel.module.css';

interface PullRequestItemProps {
  pull: PullRequestSummary;
  selected?: PullRequestRef;
  showAuthor?: boolean;
  badges?: ReactNode;
  onSelect(ref: PullRequestRef): void;
}

export function PullRequestItem({
  pull,
  selected,
  showAuthor = false,
  badges,
  onSelect,
}: PullRequestItemProps) {
  return (
    <button
      type="button"
      className={styles.item}
      aria-current={isSamePullRequest(pull.ref, selected) ? 'true' : undefined}
      onClick={() => onSelect(pull.ref)}
    >
      <Avatar user={pull.author} size={20} />
      <span className={styles.itemBody}>
        <span className={styles.itemMeta}>
          <span>
            #{pull.ref.number}
            {showAuthor && ` by ${pull.author.login}`}
          </span>
          <time dateTime={pull.updatedAt}>{formatRelativeTime(pull.updatedAt)}</time>
        </span>
        <span className={styles.itemTitle}>{pull.title}</span>
        {(pull.isDraft || badges) && (
          <span className={styles.badges}>
            {pull.isDraft && <Badge>Draft</Badge>}
            {badges}
          </span>
        )}
      </span>
    </button>
  );
}

interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'merged' | 'closed';
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}
