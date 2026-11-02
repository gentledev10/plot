import type { PullRequestRef } from '@shared/github';
import type { ReviewQuestionRequest, ReviewVerificationRequest } from '@shared/review-activity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { useLanguage } from '../language/LanguageProvider';
import { reviewKeys } from './queries';

export function useReviewActivity(ref: PullRequestRef) {
  const api = useApi();
  const { reviewLanguage } = useLanguage();
  const client = useQueryClient();
  const key = [...reviewKeys.status(ref), 'activity', reviewLanguage];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getReviewActivity(ref),
    refetchInterval: (query) =>
      query.state.data?.questionTask.state === 'running' ||
      query.state.data?.verificationTask.state === 'running'
        ? 1000
        : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const ask = useMutation({
    mutationFn: (request: ReviewQuestionRequest) => api.askReview(ref, request),
    onSettled: refresh,
  });
  const verify = useMutation({
    mutationFn: (request: ReviewVerificationRequest) => api.verifyReview(ref, request),
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: (kind: 'question' | 'verification') => api.cancelReviewActivity(ref, kind),
    onSettled: refresh,
  });
  return { query, ask, verify, cancel };
}
