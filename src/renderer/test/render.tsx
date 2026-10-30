import type { ViewerApi } from '@shared/ipc';
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
    getSession: notStubbed('getSession'),
    listInbox: notStubbed('listInbox'),
    getPullRequest: notStubbed('getPullRequest'),
    getPullRequestDiff: notStubbed('getPullRequestDiff'),
    readBlob: notStubbed('readBlob'),
    ...overrides,
  };
}

export function renderWithApi(ui: ReactElement, api: Partial<ViewerApi> = {}) {
  const fullApi = fakeApi(api);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return {
    api: fullApi,
    ...render(
      <AppProviders api={fullApi} queryClient={queryClient}>
        {ui}
      </AppProviders>,
    ),
  };
}
