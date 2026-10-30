import type { PullRequestRef } from '@shared/github';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const pullRequestKeys = {
  detail: (ref: PullRequestRef) =>
    ['pull-request', ref.owner.toLowerCase(), ref.repo.toLowerCase(), ref.number] as const,
};

export function usePullRequest(ref: PullRequestRef) {
  const api = useApi();
  return useQuery({
    queryKey: pullRequestKeys.detail(ref),
    queryFn: () => api.getPullRequest(ref),
  });
}
