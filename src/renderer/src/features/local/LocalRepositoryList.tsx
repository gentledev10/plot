import type { LocalRepository } from '@shared/local';
import { Folder, FolderPlus, X } from 'lucide-react';
import { useId } from 'react';
import { IconButton } from '../../components/IconButton';
import styles from './LocalRepositoryList.module.css';
import { useLocalRepositories, useLocalRepositoryActions } from './queries';

interface LocalRepositoryListProps {
  selectedId?: string;
  onOpen(repository: LocalRepository): void;
}

export function LocalRepositoryList({ selectedId, onOpen }: LocalRepositoryListProps) {
  const repositories = useLocalRepositories();
  const { open, remove } = useLocalRepositoryActions();
  const headingId = useId();
  const failure = open.error ?? remove.error;

  function openFolder() {
    open.mutate(undefined, {
      onSuccess: (repository) => {
        if (repository) {
          onOpen(repository);
        }
      },
    });
  }

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        <span>Local repositories</span>
        <IconButton label="Open a local repository" onClick={openFolder} busy={open.isPending}>
          <FolderPlus size={14} />
        </IconButton>
      </h3>
      {repositories.data?.length ? (
        <ul className={styles.list}>
          {repositories.data.map((repository) => (
            <li key={repository.id} className={styles.row}>
              <button
                type="button"
                className={styles.item}
                aria-current={repository.id === selectedId ? 'true' : undefined}
                onClick={() => onOpen(repository)}
              >
                <Folder size={14} className={styles.icon} />
                <span className={styles.text}>
                  <span className={styles.name}>{repository.name}</span>
                  <span className={styles.path} title={repository.path}>
                    {repository.path}
                  </span>
                </span>
              </button>
              <span className={styles.remove}>
                <IconButton
                  label={`Remove ${repository.name} from the list`}
                  onClick={() => remove.mutate(repository.id)}
                >
                  <X size={12} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          Open a git folder to see what changed in it, including work you have not committed.
        </p>
      )}
      {failure && (
        <p className={styles.error} role="alert">
          {failure.message}
        </p>
      )}
    </section>
  );
}
