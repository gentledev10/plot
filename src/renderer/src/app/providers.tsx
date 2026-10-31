import type { MenuCommand, MenuCommandListener, ViewerApi } from '@shared/ipc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { AppearanceProvider } from '../features/appearance/AppearanceProvider';
import { KeymapProvider } from '../features/keymap/KeymapProvider';
import { isRetryable } from '../lib/api';

type SubscribeToMenu = (listener: MenuCommandListener) => () => void;

interface Shell {
  platform: string;
  subscribeToMenu: SubscribeToMenu;
}

const ApiContext = createContext<ViewerApi | null>(null);

const ShellContext = createContext<Shell>({ platform: 'darwin', subscribeToMenu: () => () => {} });

export function useApi(): ViewerApi {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error('useApi must be used inside <AppProviders>');
  }
  return api;
}

export function usePlatform(): string {
  return useContext(ShellContext).platform;
}

export function useMenuCommand(command: MenuCommand, handler: () => void): void {
  const { subscribeToMenu } = useContext(ShellContext);
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(
    () =>
      subscribeToMenu((received) => {
        if (received === command) {
          latest.current();
        }
      }),
    [subscribeToMenu, command],
  );
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
  platform?: string;
  subscribeToMenu?: SubscribeToMenu;
  children: ReactNode;
}

const NO_MENU: SubscribeToMenu = () => () => {};

export function AppProviders({
  api,
  queryClient,
  platform = 'darwin',
  subscribeToMenu = NO_MENU,
  children,
}: AppProvidersProps) {
  const shell = useMemo(() => ({ platform, subscribeToMenu }), [platform, subscribeToMenu]);
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={api}>
        <ShellContext.Provider value={shell}>
          <AppearanceProvider onThemeSource={(source) => void api.setThemeSource(source)}>
            <KeymapProvider platform={platform}>{children}</KeymapProvider>
          </AppearanceProvider>
        </ShellContext.Provider>
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}
