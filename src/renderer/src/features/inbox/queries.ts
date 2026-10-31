import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const inboxKeys = {
  inbox: (accountId: string | undefined) => ['inbox', accountId] as const,
};

export function useInbox(accountId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: inboxKeys.inbox(accountId),
    queryFn: () => api.listInbox(),
    enabled: accountId !== undefined,
    refetchInterval: 5 * 60_000,
  });
}
