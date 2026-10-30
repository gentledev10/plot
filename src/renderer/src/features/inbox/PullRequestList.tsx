import type { PullRequestRef, PullRequestSummary } from '@shared/github';
import { formatPullRequestRef, isSamePullRequest } from '@shared/pull-request-ref';
import { useId } from 'react';
import { Avatar } from '../../components/Avatar';
import { formatRelativeTime } from '../../lib/format';
import styles from './InboxPanel.module.css';

interface PullRequestListProps {
  title: string;
  pulls: PullRequestSummary[];
  emptyText: string;
  selected?: PullRequestRef;
  onSelect(ref: PullRequestRef): void;
}

export function PullRequestList({
  title,
  pulls,
  emptyText,
  selected,
  onSelect,
}: PullRequestListProps) {
  const headingId = useId();
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.sectionTitle}>
        {title}
        <span className={styles.count}>{pulls.length}</span>
      </h3>
      {pulls.length === 0 ? (
        <p className={styles.emptyText}>{emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {pulls.map((pull) => (
            <li key={formatPullRequestRef(pull.ref)}>
              <button
                type="button"
                className={styles.item}
                aria-current={isSamePullRequest(pull.ref, selected) ? 'true' : undefined}
                onClick={() => onSelect(pull.ref)}
              >
                <Avatar user={pull.author} size={20} />
                <span className={styles.itemBody}>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemRepo}>
                      {pull.ref.owner}/{pull.ref.repo} #{pull.ref.number}
                    </span>
                    <time dateTime={pull.updatedAt}>{formatRelativeTime(pull.updatedAt)}</time>
                  </span>
                  <span className={styles.itemTitle}>{pull.title}</span>
                  {pull.isDraft && <span className={styles.draft}>Draft</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
