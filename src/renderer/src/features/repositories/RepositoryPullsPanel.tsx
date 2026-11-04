import type {
  PullRequestRef,
  PullRequestScope,
  PullRequestStateFilter,
  PullRequestSummary,
  RepositoryRef,
} from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import { formatRepositoryRef, repositoryUrl } from '@shared/repository-ref';
import { ChevronDown, ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useCurrentAccount } from '../accounts/queries';
import { Badge, PullRequestItem } from '../inbox/PullRequestItem';
import { useInbox } from '../inbox/queries';
import { useCommand } from '../keymap/KeymapProvider';
import { useT } from '../language/LanguageProvider';
import { useLocalPullRequestKeys } from '../local/queries';
import { useRepositoryPullRequests } from './queries';
import styles from './RepositoryPullsPanel.module.css';

const STATES: Record<PullRequestStateFilter, string> = {
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
  all: 'All',
};
const SCOPES: Record<PullRequestScope, string> = {
  everyone: 'Everyone',
  'review-requested': 'Review requested',
  authored: 'Created by me',
  assigned: 'Assigned to me',
};
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
  const t = useT();
  const name = formatRepositoryRef(repository);
  const [state, setState] = useState<PullRequestStateFilter>('open');
  const [scope, setScope] = useState<PullRequestScope>('everyone');
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');
  const pulls = useRepositoryPullRequests({
    repository,
    state,
    scope,
    text,
  });
  const items = pulls.data?.pages.flatMap((page) => page.pullRequests) ?? [];
  const total = pulls.data?.pages[0]?.total;
  const waiting = useReviewRequests();
  const local = useLocalPullRequestKeys();
  const filtered = state !== 'open' || scope !== 'everyone' || text !== '';
  function refresh() {
    void pulls.refetch();
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setText(draft.trim());
  }
  useCommand('navigation.refresh', refresh);
  return (
    <aside className={styles.panel} aria-label={name}>
      <header className={styles.header}>
        <IconButton label={t('Back to pull requests')} onClick={onBack}>
          <ChevronLeft size={14} />
        </IconButton>
        <h2 className={styles.title}>{name}</h2>
        <IconButton
          label={t('Open on GitHub')}
          onClick={() => window.open(`${repositoryUrl(repository)}/pulls`, '_blank', 'noreferrer')}
        >
          <ExternalLink size={14} />
        </IconButton>
        <IconButton label={t('Refresh')} onClick={refresh} busy={pulls.isFetching}>
          <RefreshCw size={14} />
        </IconButton>
      </header>
      <form className={styles.search} onSubmit={search}>
        <input
          className={styles.searchInput}
          type="search"
          aria-label={t('Search pull requests in {value0}', {
            value0: name,
          })}
          placeholder={t('Search, or try label:bug author:mona')}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value === '') {
              setText('');
            }
          }}
        />
      </form>
      <div className={styles.filters}>
        <Filter label={t('State')} value={state} options={STATES} onChange={setState} />
        <Filter
          label={t('Pull request scope')}
          value={scope}
          options={SCOPES}
          onChange={setScope}
        />
        {total !== undefined && (
          <span className={styles.total}>
            {total.toLocaleString()} {total === 1 ? t('pull request') : t('pull requests')}
          </span>
        )}
      </div>
      <div className={styles.content}>{renderContent()}</div>
    </aside>
  );
  function renderContent() {
    if (pulls.isPending) {
      return <StatusMessage>{t('Loading pull requests…')}</StatusMessage>;
    }
    if (pulls.isError) {
      return (
        <StatusMessage title={t('Could not load pull requests')} tone="error" onRetry={refresh}>
          {pulls.error.message}
        </StatusMessage>
      );
    }
    if (items.length === 0) {
      return (
        <StatusMessage>
          {filtered ? t('No pull requests match.') : t('No open pull requests.')}
        </StatusMessage>
      );
    }
    return (
      <>
        <ul
          className={styles.list}
          aria-label={t('Pull requests in {value0}', {
            value0: name,
          })}
        >
          {items.map((pull) => (
            <li key={pull.ref.number}>
              <PullRequestItem
                pull={pull}
                selected={selected}
                showAuthor
                local={local.has(pullRequestKey(pull.ref))}
                badges={badges(pull, waiting)}
                onSelect={onSelect}
              />
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
            {pulls.isFetchingNextPage ? t('Loading…') : t('Load more')}
          </button>
        )}
      </>
    );
  }
}
function useReviewRequests(): ReadonlySet<string> {
  const inbox = useInbox(useCurrentAccount()?.id);
  return new Set(inbox.data?.reviewRequested.map((pull) => pullRequestKey(pull.ref)));
}
function badges(pull: PullRequestSummary, waiting: ReadonlySet<string>) {
  const requested = waiting.has(pullRequestKey(pull.ref));
  if (pull.state === 'open' && !requested) {
    return undefined;
  }
  return (
    <>
      {pull.state === 'merged' && <Badge tone="merged">Merged</Badge>}
      {pull.state === 'closed' && <Badge tone="closed">Closed</Badge>}
      {requested && <Badge tone="accent">Review requested</Badge>}
    </>
  );
}
interface FilterProps<T extends string> {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange(value: T): void;
}
function Filter<T extends string>({ label, value, options, onChange }: FilterProps<T>) {
  const t = useT();
  return (
    <label className={styles.filter}>
      <span className={styles.hidden}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {(Object.entries(options) as [T, string][]).map(([id, text]) => (
          <option key={id} value={id}>
            {t(text)}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  );
}
