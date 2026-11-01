import type { LocalTarget } from '@shared/local';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApi } from '../../app/providers';
import { diffKeys } from '../diff/queries';

export const localKeys = {
  repositories: ['local-repositories'] as const,
  statuses: ['local-status'] as const,
  status: (repositoryId: string) => ['local-status', repositoryId] as const,
  signature: ({ repositoryId, compare }: LocalTarget) =>
    ['local-signature', repositoryId, compare] as const,
};

export const LOCAL_REFRESH_MS = 2_000;

export const LOCAL_STATUS_REFRESH_MS = 5_000;

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
    refetchInterval: LOCAL_REFRESH_MS,
    staleTime: 0,
  });
  const previous = useRef<string | undefined>(undefined);
  const { repositoryId } = target;

  useEffect(() => {
    if (signature.data === undefined) {
      return;
    }
    if (previous.current !== undefined && previous.current !== signature.data) {
      void client.invalidateQueries({ queryKey: diffKeys.local(repositoryId) });
    }
    previous.current = signature.data;
  }, [signature.data, client, repositoryId]);
}
