import type { RepositoryRef } from '@shared/github';
import { GITHUB_HOST } from '@shared/hosts';
import { formatRepositoryRef, repositoryKey } from '@shared/repository-ref';
import { CircleAlert, GitPullRequest, Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { usePreference } from '../../lib/preferences';
import { AddRepositoryPopover } from './AddRepositoryPopover';
import { useOpenPullRequestCount } from './queries';
import styles from './RepositorySection.module.css';
import {
  addRepository,
  matchesRepository,
  parseRepositoryList,
  REPOSITORY_LIST_PREFERENCE,
  removeRepository,
} from './repository-list';

interface RepositorySectionProps {
  query: string;
  accountId: string;
  defaultHost: string;
  onOpen(ref: RepositoryRef): void;
}

export function RepositorySection({
  query,
  accountId,
  defaultHost,
  onOpen,
}: RepositorySectionProps) {
  const headingId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [repositories, setRepositories] = usePreference<RepositoryRef[]>(
    REPOSITORY_LIST_PREFERENCE,
    [],
    parseRepositoryList,
  );
  const [adding, setAdding] = useState(false);
  const visible = repositories.filter((ref) => matchesRepository(ref, query));

  function closePopover() {
    setAdding(false);
    addButton.current?.focus();
  }

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.title}>
          Repositories
          <span className={styles.total}>{repositories.length}</span>
        </h3>
        <IconButton
          ref={addButton}
          label="Add a repository"
          expanded={adding}
          onClick={() => (adding ? closePopover() : setAdding(true))}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      {adding && (
        <AddRepositoryPopover
          anchor={addButton.current}
          existing={repositories}
          accountId={accountId}
          defaultHost={defaultHost}
          onAdd={(ref) => setRepositories(addRepository(repositories, ref))}
          onClose={closePopover}
        />
      )}
      {visible.length === 0 ? (
        <p className={styles.empty}>
          {repositories.length === 0
            ? 'Add a repository to browse all of its pull requests.'
            : 'No repositories match.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((ref) => (
            <RepositoryRow
              key={repositoryKey(ref)}
              repository={ref}
              onOpen={() => onOpen(ref)}
              onRemove={() => setRepositories(removeRepository(repositories, ref))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface RepositoryRowProps {
  repository: RepositoryRef;
  onOpen(): void;
  onRemove(): void;
}

function RepositoryRow({ repository, onOpen, onRemove }: RepositoryRowProps) {
  const count = useOpenPullRequestCount(repository);
  const name = formatRepositoryRef(repository);

  return (
    <li className={styles.row}>
      <button type="button" className={styles.item} onClick={onOpen}>
        <span className={styles.name}>
          {repository.owner}/{repository.repo}
        </span>
        <span className={styles.host}>
          {repository.host === GITHUB_HOST ? '' : repository.host}
        </span>
        {count.data !== undefined && (
          <span className={styles.count} title={`${count.data} open pull requests`}>
            <GitPullRequest size={12} aria-hidden="true" />
            {count.data}
          </span>
        )}
        {count.isError && (
          <span
            className={styles.failed}
            title={count.error.message}
            role="img"
            aria-label={`Could not count the pull requests: ${count.error.message}`}
          >
            <CircleAlert size={12} aria-hidden="true" />
          </span>
        )}
      </button>
      <span className={styles.remove}>
        <IconButton label={`Remove ${name} from the list`} onClick={onRemove}>
          <X size={12} />
        </IconButton>
      </span>
    </li>
  );
}
