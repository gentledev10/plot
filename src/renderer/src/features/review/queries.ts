import type { PullRequestRef } from '@shared/github';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { useLanguage } from '../language/LanguageProvider';
import { pullRequestKeys } from '../pull-request/queries';

export const reviewKeys = {
  status: (ref: PullRequestRef) => [...pullRequestKeys.detail(ref), 'review'] as const,
};

export function useReviewStatus(ref: PullRequestRef) {
  const api = useApi();
  const { reviewLanguage } = useLanguage();
  return useQuery({
    queryKey: [...reviewKeys.status(ref), reviewLanguage],
    queryFn: () => api.getReviewStatus(ref),
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 1_000 : false),
  });
}

export function useReviewActions(ref: PullRequestRef) {
  const api = useApi();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: reviewKeys.status(ref) });
  const start = useMutation({ mutationFn: () => api.startReview(ref), onSettled: refresh });
  const cancel = useMutation({ mutationFn: () => api.cancelReview(ref), onSettled: refresh });
  return { start, cancel };
}
