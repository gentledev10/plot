import type { PullRequestRef, PullRequestSummary } from '@shared/github';
import { isSamePullRequest } from '@shared/pull-request-ref';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { formatRelativeTime } from '../../lib/format';
import { useLanguage, useT } from '../language/LanguageProvider';
import styles from './InboxPanel.module.css';

interface PullRequestItemProps {
  pull: PullRequestSummary;
  selected?: PullRequestRef;
  showAuthor?: boolean;
  local?: boolean;
  badges?: ReactNode;
  onSelect(ref: PullRequestRef): void;
}
export function PullRequestItem({
  pull,
  selected,
  showAuthor = false,
  local = false,
  badges,
  onSelect,
}: PullRequestItemProps) {
  const t = useT();
  const { language } = useLanguage();
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
            {showAuthor &&
              t(' by {value0}', {
                value0: pull.author.login,
              })}
          </span>
          <time dateTime={pull.updatedAt}>
            {formatRelativeTime(pull.updatedAt, undefined, language)}
          </time>
        </span>
        <span className={styles.itemTitle}>{pull.title}</span>
        {(pull.isDraft || badges || local) && (
          <span className={styles.badges}>
            {pull.isDraft && <Badge>{t('Draft')}</Badge>}
            {badges}
            {local && (
              <Badge title={t('Its branch is checked out on this Mac')}>{t('Local')}</Badge>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'merged' | 'closed';
  title?: string;
  children: ReactNode;
}
export function Badge({ tone = 'neutral', title, children }: BadgeProps) {
  const t = useT();
  return (
    <span className={styles.badge} data-tone={tone} title={title}>
      {typeof children === 'string' ? t(children) : children}
    </span>
  );
}
