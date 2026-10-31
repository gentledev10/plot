import type { LocalCompare } from '@shared/local';
import { useQueryClient } from '@tanstack/react-query';
import { DiffWorkspace, type WorkspaceSelection } from '../diff/DiffWorkspace';
import { diffKeys } from '../diff/queries';
import { LocalHeader } from './LocalHeader';
import { useLocalAutoRefresh, useLocalRepositories } from './queries';

interface LocalWorkspaceProps extends WorkspaceSelection {
  repositoryId: string;
  compare: LocalCompare;
  onCompareChange(compare: LocalCompare): void;
}

export function LocalWorkspace({
  repositoryId,
  compare,
  onCompareChange,
  ...selection
}: LocalWorkspaceProps) {
  const queryClient = useQueryClient();
  const repository = useLocalRepositories().data?.find((item) => item.id === repositoryId);
  useLocalAutoRefresh({ repositoryId, compare });

  return (
    <DiffWorkspace
      target={{ kind: 'local', repositoryId, compare }}
      header={
        <LocalHeader
          repository={repository}
          repositoryId={repositoryId}
          compare={compare}
          onCompareChange={onCompareChange}
        />
      }
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: diffKeys.local(repositoryId) });
      }}
      {...selection}
    />
  );
}
