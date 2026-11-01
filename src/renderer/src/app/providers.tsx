import type { MenuCommand, MenuCommandListener, PlotApi } from '@shared/ipc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { AppearanceProvider } from '../features/appearance/AppearanceProvider';
import { KeymapProvider } from '../features/keymap/KeymapProvider';
import { LanguageProvider } from '../features/language/LanguageProvider';
import { ReviewPlanProvider } from '../features/review/ReviewPlanProvider';
import { isRetryable } from '../lib/api';

type SubscribeToMenu = (listener: MenuCommandListener) => () => void;

interface Shell {
  platform: string;
  subscribeToMenu: SubscribeToMenu;
}

const ApiContext = createContext<PlotApi | null>(null);

const ShellContext = createContext<Shell>({ platform: 'darwin', subscribeToMenu: () => () => {} });

export function useApi(): PlotApi {
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
  api: PlotApi;
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
            <LanguageProvider api={api}>
              <ReviewPlanProvider api={api}>
                <KeymapProvider platform={platform}>{children}</KeymapProvider>
              </ReviewPlanProvider>
            </LanguageProvider>
          </AppearanceProvider>
        </ShellContext.Provider>
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}
