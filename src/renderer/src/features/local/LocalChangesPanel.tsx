import type { LocalRepository } from '@shared/local';
import { useQueryClient } from '@tanstack/react-query';
import { Folder, FolderPlus, GitBranch, RefreshCw, X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useCommand } from '../keymap/KeymapProvider';
import styles from './LocalChangesPanel.module.css';
import {
  localKeys,
  useLocalRepositories,
  useLocalRepositoryActions,
  useLocalStatus,
} from './queries';

interface LocalChangesPanelProps {
  selectedId?: string;
  active?: boolean;
  onOpen(repository: LocalRepository): void;
}

export function LocalChangesPanel({ selectedId, active = true, onOpen }: LocalChangesPanelProps) {
  const queryClient = useQueryClient();
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

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: localKeys.repositories });
    void queryClient.invalidateQueries({ queryKey: localKeys.statuses });
  }

  useCommand('navigation.refresh', refresh, active);

  return (
    <aside className={styles.panel} aria-label="Local changes">
      <header className={styles.header}>
        <h2 className={styles.title}>Local changes</h2>
        <span className={styles.actions}>
          <IconButton label="Open a local repository" onClick={openFolder} busy={open.isPending}>
            <FolderPlus size={14} />
          </IconButton>
          <IconButton label="Refresh" onClick={refresh} busy={repositories.isFetching}>
            <RefreshCw size={14} />
          </IconButton>
        </span>
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
          <RepositoryRow
            key={repository.id}
            repository={repository}
            selected={repository.id === selectedId}
            live={active}
            onOpen={() => onOpen(repository)}
            onRemove={() => remove.mutate(repository.id)}
          />
        ))}
      </ul>
    );
  }
}

interface RepositoryRowProps {
  repository: LocalRepository;
  selected: boolean;
  live: boolean;
  onOpen(): void;
  onRemove(): void;
}

function RepositoryRow({ repository, selected, live, onOpen, onRemove }: RepositoryRowProps) {
  const status = useLocalStatus(repository.id, live);

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.item}
        aria-current={selected ? 'true' : undefined}
        title={repository.path}
        onClick={onOpen}
      >
        <Folder size={14} className={styles.icon} />
        <span className={styles.text}>
          <span className={styles.name}>{repository.name}</span>
          {status.data && (
            <span className={styles.branch}>
              <GitBranch size={11} />
              <span className={styles.branchName}>{status.data.branch ?? 'Detached HEAD'}</span>
            </span>
          )}
          {status.isError && (
            <span className={styles.unreadable} title={status.error.message}>
              Could not read this folder
            </span>
          )}
        </span>
        {status.data && (
          <span className={styles.changed}>
            {status.data.changedFiles === 0 ? 'No changes' : `${status.data.changedFiles} changed`}
          </span>
        )}
      </button>
      <span className={styles.remove}>
        <IconButton label={`Remove ${repository.name} from the list`} onClick={onRemove}>
          <X size={12} />
        </IconButton>
      </span>
    </li>
  );
}
