import type { LocalTarget } from '@shared/local';
import { pullRequestKey } from '@shared/pull-request-ref';
import { hashKey, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApi } from '../../app/providers';
import { diffKeys } from '../diff/queries';

export const localKeys = {
  repositories: ['local-repositories'] as const,
  statuses: ['local-status'] as const,
  status: (repositoryId: string) => ['local-status', repositoryId] as const,
  pullRequest: (repositoryId: string, branch: string | null) =>
    ['local-pull-request', repositoryId, branch] as const,
  signature: (target: LocalTarget) => ['local-signature', target.repositoryId, target] as const,
  history: (repositoryId: string, ref?: string) => ['local-history', repositoryId, ref] as const,
};

export const LOCAL_REFRESH_MS = 2_000;

export const LOCAL_STATUS_REFRESH_MS = 5_000;

export function useLocalHistory(repositoryId: string, ref?: string) {
  const api = useApi();
  return useQuery({
    queryKey: localKeys.history(repositoryId, ref),
    queryFn: () => api.getLocalHistory(repositoryId, ref),
  });
}

export function useLocalRepositories() {
  const api = useApi();
  return useQuery({
    queryKey: localKeys.repositories,
    queryFn: () => api.listLocalRepositories(),
  });
}

export function useLocalStatus(repositoryId: string, live: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: localKeys.status(repositoryId),
    queryFn: () => api.getLocalStatus(repositoryId),
    refetchInterval: live ? LOCAL_STATUS_REFRESH_MS : false,
  });
}

const PULL_REQUEST_STALE_MS = 60_000;

export function useLocalPullRequest(repositoryId: string, branch: string | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: localKeys.pullRequest(repositoryId, branch ?? null),
    queryFn: () => api.findLocalPullRequest(repositoryId),
    enabled: typeof branch === 'string',
    staleTime: PULL_REQUEST_STALE_MS,
  });
}

export function useLocalPullRequestKeys(): ReadonlySet<string> {
  const api = useApi();
  const repositories = useLocalRepositories().data ?? [];
  const statuses = useQueries({
    queries: repositories.map(({ id }) => ({
      queryKey: localKeys.status(id),
      queryFn: () => api.getLocalStatus(id),
    })),
  });
  const pulls = useQueries({
    queries: repositories.map(({ id }, index) => {
      const branch = statuses[index]?.data?.branch ?? null;
      return {
        queryKey: localKeys.pullRequest(id, branch),
        queryFn: () => api.findLocalPullRequest(id),
        enabled: branch !== null,
        staleTime: PULL_REQUEST_STALE_MS,
      };
    }),
  });
  return new Set(pulls.flatMap(({ data }) => (data ? [pullRequestKey(data.ref)] : [])));
}

export function useLocalRepositoryActions() {
  const api = useApi();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: localKeys.repositories });
  return {
    open: useMutation({ mutationFn: () => api.openLocalRepository(), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id: string) => api.removeLocalRepository(id),
      onSuccess: refresh,
    }),
  };
}

// Git has no change notification, so a cheap signature of the working tree is polled and the
// diff is loaded again only when it changes.
export function useLocalAutoRefresh(target: LocalTarget): void {
  const api = useApi();
  const client = useQueryClient();
  const signature = useQuery({
    queryKey: localKeys.signature(target),
    queryFn: () => api.getLocalSignature(target),
    enabled: target.compare !== 'commits' || Boolean(target.commits?.length),
    refetchInterval: LOCAL_REFRESH_MS,
    staleTime: 0,
  });
  const previous = useRef<{ key: string; value: string } | undefined>(undefined);
  const { repositoryId } = target;
  const key = hashKey(localKeys.signature(target));

  useEffect(() => {
    if (signature.data === undefined) {
      return;
    }
    if (previous.current?.key === key && previous.current.value !== signature.data) {
      void client.invalidateQueries({ queryKey: diffKeys.local(repositoryId) });
    }
    previous.current = { key, value: signature.data };
  }, [signature.data, client, repositoryId, key]);
}
