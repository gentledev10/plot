import type { ViewerApi } from '@shared/ipc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';
import { isRetryable } from '../lib/api';

const ApiContext = createContext<ViewerApi | null>(null);

export function useApi(): ViewerApi {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error('useApi must be used inside <AppProviders>');
  }
  return api;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
      },
    },
  });
}

interface AppProvidersProps {
  api: ViewerApi;
  queryClient: QueryClient;
  children: ReactNode;
}

export function AppProviders({ api, queryClient, children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  );
}
