import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const inboxKeys = {
  session: ['session'] as const,
  inbox: ['inbox'] as const,
};

export function useSession() {
  const api = useApi();
  return useQuery({ queryKey: inboxKeys.session, queryFn: () => api.getSession() });
}

export function useInbox(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: inboxKeys.inbox,
    queryFn: () => api.listInbox(),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}
