import type { LocalRepository } from '@shared/local';
import { Folder, FolderPlus, X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import styles from './LocalChangesPanel.module.css';
import { useLocalRepositories, useLocalRepositoryActions } from './queries';

interface LocalChangesPanelProps {
  selectedId?: string;
  onOpen(repository: LocalRepository): void;
}

export function LocalChangesPanel({ selectedId, onOpen }: LocalChangesPanelProps) {
  const repositories = useLocalRepositories();
  const { open, remove } = useLocalRepositoryActions();
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
    <aside className={styles.panel} aria-label="Local changes">
      <header className={styles.header}>
        <h2 className={styles.title}>Local changes</h2>
        <IconButton label="Open a local repository" onClick={openFolder} busy={open.isPending}>
          <FolderPlus size={14} />
        </IconButton>
      </header>
      <div className={styles.content}>
        {renderRepositories()}
        {failure && (
          <p className={styles.error} role="alert">
            {failure.message}
          </p>
        )}
      </div>
    </aside>
  );

  function renderRepositories() {
    if (repositories.isError) {
      return (
        <StatusMessage
          title="Could not load your folders"
          tone="error"
          onRetry={() => void repositories.refetch()}
        >
          {repositories.error.message}
        </StatusMessage>
      );
    }
    if (!repositories.data) {
      return null;
    }
    if (repositories.data.length === 0) {
      return (
        <StatusMessage action={{ label: 'Choose a folder…', run: openFolder }}>
          Open a git folder to see what changed in it, including work you have not committed.
        </StatusMessage>
      );
    }
    return (
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
    );
  }
}
