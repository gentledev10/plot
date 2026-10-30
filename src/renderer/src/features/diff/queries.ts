import type { BlobContent } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { pullRequestKeys } from '../pull-request/queries';

const EMPTY: BlobContent = { kind: 'text', text: '' };

export const diffKeys = {
  diff: (ref: PullRequestRef) => [...pullRequestKeys.detail(ref), 'diff'] as const,
  blob: (ref: PullRequestRef, blob: string | null) =>
    ['blob', ref.owner.toLowerCase(), ref.repo.toLowerCase(), blob] as const,
};

export function usePullRequestDiff(ref: PullRequestRef) {
  const api = useApi();
  return useQuery({
    queryKey: diffKeys.diff(ref),
    queryFn: () => api.getPullRequestDiff(ref),
    staleTime: 60_000,
  });
}

export function useBlob(ref: PullRequestRef, blob: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: diffKeys.blob(ref, blob),
    queryFn: () => (blob ? api.readBlob(ref, blob) : Promise.resolve(EMPTY)),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
