import type { ViewerBridge } from '@shared/ipc';
import { describe, expect, it, vi } from 'vitest';
import { createApi, isRetryable, ViewerError } from './api';

function bridge(overrides: Partial<ViewerBridge> = {}): ViewerBridge {
  return {
    platform: 'darwin',
    onMenuCommand: () => () => {},
    listAccounts: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { accounts: [], browserSignIn: false } }),
    switchAccount: vi.fn(),
    removeAccount: vi.fn(),
    signInWithToken: vi.fn(),
    signInWithGitHubCli: vi.fn(),
    startBrowserSignIn: vi.fn(),
    finishBrowserSignIn: vi.fn(),
    cancelBrowserSignIn: vi.fn(),
    listInbox: vi.fn(),
    getPullRequest: vi.fn(),
    getPullRequestDiff: vi.fn(),
    readBlob: vi.fn(),
    getReviewStatus: vi.fn(),
    startReview: vi.fn(),
    cancelReview: vi.fn(),
    getAiSettings: vi.fn(),
    updateAiSettings: vi.fn(),
    detectAiProviders: vi.fn(),
    setThemeSource: vi.fn(),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
    openLocalRepository: vi.fn(),
    listLocalRepositories: vi.fn(),
    removeLocalRepository: vi.fn(),
    getLocalDiff: vi.fn(),
    getLocalSignature: vi.fn(),
    readLocalBlob: vi.fn(),
    readLocalFile: vi.fn(),
    ...overrides,
  };
}

describe('createApi', () => {
  it('unwraps successful responses', async () => {
    const api = createApi(bridge());
    await expect(api.listAccounts()).resolves.toEqual({ accounts: [], browserSignIn: false });
  });

  it('forwards arguments to the bridge', async () => {
    const getPullRequest = vi.fn().mockResolvedValue({ ok: true, value: { title: 'x' } });
    const api = createApi(bridge({ getPullRequest }));
    const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 1 };

    await api.getPullRequest(ref);
    expect(getPullRequest).toHaveBeenCalledWith(ref);
  });

  it('turns failed responses into ViewerError with the code', async () => {
    const api = createApi(
      bridge({
        listInbox: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'network', message: 'Could not reach GitHub.' },
        }),
      }),
    );

    const error = await api.listInbox().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ViewerError);
    expect(error).toMatchObject({ code: 'network', message: 'Could not reach GitHub.' });
  });
});

describe('isRetryable', () => {
  it('does not retry errors that need the user to act', () => {
    expect(isRetryable(new ViewerError('gh-not-authenticated', ''))).toBe(false);
    expect(isRetryable(new ViewerError('github-not-found', ''))).toBe(false);
    expect(isRetryable(new ViewerError('github-rate-limited', ''))).toBe(false);
  });

  it('retries transient failures', () => {
    expect(isRetryable(new ViewerError('network', ''))).toBe(true);
    expect(isRetryable(new ViewerError('github-request-failed', ''))).toBe(true);
    expect(isRetryable(new Error('IPC channel closed'))).toBe(true);
  });
});
