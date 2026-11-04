import type { LocalTarget } from '@shared/local';
import { useQueryClient } from '@tanstack/react-query';
import { DiffWorkspace, type WorkspaceSelection } from '../diff/DiffWorkspace';
import { diffKeys } from '../diff/queries';
import { LocalHeader } from './LocalHeader';
import { useLocalAutoRefresh, useLocalRepositories } from './queries';

interface LocalWorkspaceProps extends WorkspaceSelection {
  target: LocalTarget;
  onTargetChange(target: LocalTarget): void;
}

export function LocalWorkspace({ target, onTargetChange, ...selection }: LocalWorkspaceProps) {
  const queryClient = useQueryClient();
  const repository = useLocalRepositories().data?.find((item) => item.id === target.repositoryId);
  useLocalAutoRefresh(target);

  return (
    <DiffWorkspace
      target={{ kind: 'local', ...target }}
      header={
        <LocalHeader repository={repository} target={target} onTargetChange={onTargetChange} />
      }
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: diffKeys.local(target.repositoryId) });
        void queryClient.invalidateQueries({ queryKey: ['local-history', target.repositoryId] });
      }}
      {...selection}
    />
  );
}
