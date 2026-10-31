import type { MenuCommandListener, ViewerApi } from '@shared/ipc';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AppProviders } from '../src/app/providers';

function notStubbed(method: string) {
  return vi.fn().mockRejectedValue(new Error(`${method} was not stubbed in this test`));
}

export function fakeApi(overrides: Partial<ViewerApi> = {}): ViewerApi {
  return {
    listAccounts: notStubbed('listAccounts'),
    switchAccount: notStubbed('switchAccount'),
    removeAccount: notStubbed('removeAccount'),
    signInWithToken: notStubbed('signInWithToken'),
    signInWithGitHubCli: notStubbed('signInWithGitHubCli'),
    startBrowserSignIn: notStubbed('startBrowserSignIn'),
    finishBrowserSignIn: notStubbed('finishBrowserSignIn'),
    cancelBrowserSignIn: vi.fn().mockResolvedValue(undefined),
    listInbox: notStubbed('listInbox'),
    getPullRequest: notStubbed('getPullRequest'),
    getPullRequestDiff: notStubbed('getPullRequestDiff'),
    readBlob: notStubbed('readBlob'),
    getReviewStatus: vi.fn().mockResolvedValue({ state: 'idle' }),
    startReview: notStubbed('startReview'),
    cancelReview: notStubbed('cancelReview'),
    getAiSettings: vi.fn().mockResolvedValue({ provider: 'claude-code', models: {} }),
    updateAiSettings: notStubbed('updateAiSettings'),
    detectAiProviders: notStubbed('detectAiProviders'),
    setThemeSource: vi.fn().mockResolvedValue(undefined),
    getPreferences: vi.fn().mockResolvedValue({}),
    setPreference: vi.fn().mockResolvedValue(undefined),
    openLocalRepository: notStubbed('openLocalRepository'),
    listLocalRepositories: vi.fn().mockResolvedValue([]),
    removeLocalRepository: notStubbed('removeLocalRepository'),
    getLocalDiff: notStubbed('getLocalDiff'),
    getLocalSignature: vi.fn().mockResolvedValue('signature'),
    readLocalBlob: notStubbed('readLocalBlob'),
    readLocalFile: notStubbed('readLocalFile'),
    ...overrides,
  };
}

export function fakeMenu() {
  const listeners = new Set<MenuCommandListener>();
  return {
    subscribe(listener: MenuCommandListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(command: Parameters<MenuCommandListener>[0]) {
      for (const listener of listeners) {
        listener(command);
      }
    },
  };
}

export function renderWithApi(
  ui: ReactElement,
  api: Partial<ViewerApi> = {},
  { menu = fakeMenu() }: { menu?: ReturnType<typeof fakeMenu> } = {},
) {
  const fullApi = fakeApi(api);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return {
    api: fullApi,
    menu,
    queryClient,
    ...render(
      <AppProviders
        api={fullApi}
        queryClient={queryClient}
        platform="darwin"
        subscribeToMenu={menu.subscribe}
      >
        {ui}
      </AppProviders>,
    ),
  };
}
