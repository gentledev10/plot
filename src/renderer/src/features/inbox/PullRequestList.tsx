import type { PullRequestRef, PullRequestSummary } from '@shared/github';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { groupByRepository, type RepositoryGroup } from './grouping';
import styles from './InboxPanel.module.css';
import { PullRequestItem } from './PullRequestItem';

interface PullRequestListProps {
  title: string;
  pulls: PullRequestSummary[];
  emptyText: string;
  selected?: PullRequestRef;
  collapsed: ReadonlySet<string>;
  collapsible: boolean;
  onToggleGroup(key: string): void;
  onSelect(ref: PullRequestRef): void;
}

export function PullRequestList({
  title,
  pulls,
  emptyText,
  selected,
  collapsed,
  collapsible,
  onToggleGroup,
  onSelect,
}: PullRequestListProps) {
  const headingId = useId();
  const groups = groupByRepository(pulls);
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.sectionTitle}>
        {title}
        <span className={styles.count}>{pulls.length}</span>
      </h3>
      {groups.length === 0 ? (
        <p className={styles.emptyText}>{emptyText}</p>
      ) : (
        <ul className={styles.groups}>
          {groups.map((group) => (
            <RepositoryGroupItem
              key={group.key}
              group={group}
              open={!collapsed.has(group.key)}
              collapsible={collapsible}
              selected={selected}
              onToggle={() => onToggleGroup(group.key)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface RepositoryGroupItemProps {
  group: RepositoryGroup;
  open: boolean;
  collapsible: boolean;
  selected?: PullRequestRef;
  onToggle(): void;
  onSelect(ref: PullRequestRef): void;
}

function RepositoryGroupItem({
  group,
  open,
  collapsible,
  selected,
  onToggle,
  onSelect,
}: RepositoryGroupItemProps) {
  const listId = useId();
  const label = (
    <>
      <span className={styles.groupName}>{group.name}</span>
      <span className={styles.groupCount}>{group.pulls.length}</span>
    </>
  );
  return (
    <li>
      {collapsible ? (
        <button
          type="button"
          className={styles.groupHeader}
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
        </button>
      ) : (
        <div className={styles.groupHeader}>{label}</div>
      )}
      <ul id={listId} className={styles.list} aria-label={group.name} hidden={!open}>
        {group.pulls.map((pull) => (
          <li key={pull.ref.number}>
            <PullRequestItem pull={pull} selected={selected} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </li>
  );
}
