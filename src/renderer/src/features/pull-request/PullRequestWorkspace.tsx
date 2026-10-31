import type { PullRequestRef } from '@shared/github';
import { useQueryClient } from '@tanstack/react-query';
import { DiffWorkspace, type WorkspaceSelection } from '../diff/DiffWorkspace';
import { PullRequestHeader } from './PullRequestHeader';
import { pullRequestKeys } from './queries';

interface PullRequestWorkspaceProps extends WorkspaceSelection {
  target: PullRequestRef;
}

export function PullRequestWorkspace({ target, ...selection }: PullRequestWorkspaceProps) {
  const queryClient = useQueryClient();
  return (
    <DiffWorkspace
      target={{ kind: 'pull-request', ref: target }}
      header={<PullRequestHeader target={target} />}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: pullRequestKeys.detail(target) });
      }}
      {...selection}
    />
  );
}
