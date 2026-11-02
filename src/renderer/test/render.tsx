import type { MenuCommandListener, PlotApi } from '@shared/ipc';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AppProviders } from '../src/app/providers';

function notStubbed(method: string) {
  return vi.fn().mockRejectedValue(new Error(`${method} was not stubbed in this test`));
}

export function fakeApi(overrides: Partial<PlotApi> = {}): PlotApi {
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
    listAccessibleRepositories: vi.fn().mockResolvedValue([]),
    findRepository: notStubbed('findRepository'),
    countOpenPullRequests: vi.fn().mockResolvedValue(0),
    listRepositoryPullRequests: notStubbed('listRepositoryPullRequests'),
    getPullRequestDiff: notStubbed('getPullRequestDiff'),
    readBlob: notStubbed('readBlob'),
    getReviewStatus: vi.fn().mockResolvedValue({ state: 'idle' }),
    startReview: notStubbed('startReview'),
    cancelReview: notStubbed('cancelReview'),
    getReviewActivity: vi.fn().mockResolvedValue({
      head: 'd'.repeat(40),
      questions: [],
      verifications: [],
      questionTask: { state: 'idle' },
      verificationTask: { state: 'idle' },
    }),
    askReview: notStubbed('askReview'),
    verifyReview: notStubbed('verifyReview'),
    cancelReviewActivity: vi.fn().mockResolvedValue(undefined),
    getAiSettings: vi.fn().mockResolvedValue({ provider: 'claude-code', models: {} }),
    updateAiSettings: notStubbed('updateAiSettings'),
    detectAiProviders: notStubbed('detectAiProviders'),
    listAiModels: vi.fn().mockResolvedValue([]),
    saveAiApiKey: notStubbed('saveAiApiKey'),
    removeAiApiKey: notStubbed('removeAiApiKey'),
    setThemeSource: vi.fn().mockResolvedValue(undefined),
    listInstalledFonts: vi.fn().mockResolvedValue([]),
    listAddedFonts: vi.fn().mockResolvedValue([]),
    addFonts: notStubbed('addFonts'),
    readAddedFont: notStubbed('readAddedFont'),
    removeAddedFont: notStubbed('removeAddedFont'),
    getPreferences: vi.fn().mockResolvedValue({}),
    setPreference: vi.fn().mockResolvedValue(undefined),
    openLocalRepository: notStubbed('openLocalRepository'),
    listLocalRepositories: vi.fn().mockResolvedValue([]),
    removeLocalRepository: notStubbed('removeLocalRepository'),
    getLocalStatus: vi.fn().mockResolvedValue({ branch: 'main', changedFiles: 0 }),
    findLocalPullRequest: vi.fn().mockResolvedValue(null),
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
  api: Partial<PlotApi> = {},
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
