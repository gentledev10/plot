import type { PullRequestPage, RepositoryPullRequestQuery, RepositoryRef } from '@shared/github';
import { repositoryKey } from '@shared/repository-ref';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

// GitHub search returns at most this many results for any query.
const SEARCH_RESULT_LIMIT = 1000;

export const repositoryKeys = {
  choices: (accountId: string | undefined) => ['repository-choices', accountId] as const,
  openCount: (ref: RepositoryRef) => ['open-pull-request-count', repositoryKey(ref)] as const,
  pullRequests: ({ repository, state, scope, text }: RepositoryFilters) =>
    ['repository-pull-requests', repositoryKey(repository), state, scope, text] as const,
};

export type RepositoryFilters = Omit<RepositoryPullRequestQuery, 'page'>;

export function useRepositoryChoices(accountId: string | undefined, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: repositoryKeys.choices(accountId),
    queryFn: () => api.listAccessibleRepositories(),
    enabled: enabled && accountId !== undefined,
    staleTime: 5 * 60_000,
  });
}

export function useOpenPullRequestCount(ref: RepositoryRef) {
  const api = useApi();
  return useQuery({
    queryKey: repositoryKeys.openCount(ref),
    queryFn: () => api.countOpenPullRequests(ref),
    staleTime: 60_000,
  });
}

export function useFindRepository() {
  const api = useApi();
  return useMutation({ mutationFn: (ref: RepositoryRef) => api.findRepository(ref) });
}

export function useRepositoryPullRequests(filters: RepositoryFilters) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: repositoryKeys.pullRequests(filters),
    queryFn: ({ pageParam }) => api.listRepositoryPullRequests({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last: PullRequestPage, pages: PullRequestPage[]) => {
      const loaded = pages.reduce((count, page) => count + page.pullRequests.length, 0);
      const available = Math.min(last.total, SEARCH_RESULT_LIMIT);
      return last.pullRequests.length > 0 && loaded < available ? pages.length + 1 : undefined;
    },
  });
}
