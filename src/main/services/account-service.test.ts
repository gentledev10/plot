import type { Account } from '@shared/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { AccountStore } from '../accounts/account-store';
import { AppError } from '../errors';
import type { Fetch, GitHubClient } from '../github/client';
import type { OAuthTokens } from '../github/oauth';
import type { TokenProvider } from '../github/token';
import { createAccountService } from './account-service';

function memoryStore(): AccountStore & { tokens: Map<string, OAuthTokens> } {
  let accounts: Account[] = [];
  let currentId: string | undefined;
  const tokens = new Map<string, OAuthTokens>();
  return {
    tokens,
    read: async () => ({ accounts, currentId }),
    save: async (account, saved) => {
      accounts = [...accounts.filter((item) => item.id !== account.id), account];
      currentId = account.id;
      if (saved !== undefined) {
        tokens.set(account.id, saved);
      }
    },
    saveTokens: async (id, saved) => {
      tokens.set(id, saved);
    },
    remove: async (id) => {
      accounts = accounts.filter((item) => item.id !== id);
      currentId = accounts[0]?.id;
    },
    setCurrent: async (id) => {
      currentId = id;
    },
    readTokens: async (id) => tokens.get(id) ?? { accessToken: '' },
  };
}

const users: Record<string, string> = { ghp_mona: 'Mona', gho_browser: 'Mona', gh_cli: 'hubot' };

function setup({ browser = true, fetch = vi.fn<Fetch>() } = {}) {
  const store = memoryStore();
  const connections = { forget: vi.fn() };
  const clientFor = vi.fn((_host: string, tokens: TokenProvider) => {
    const getViewer = async () => {
      const login = users[await tokens.getToken()];
      if (!login) {
        throw new AppError('github-unauthorized', 'Bad credentials');
      }
      return { login, avatarUrl: `https://avatars.githubusercontent.com/${login}` };
    };
    return { getViewer } as unknown as GitHubClient;
  });
  const service = createAccountService({
    store,
    connections,
    clientFor,
    gitHubCliTokens: () => ({ getToken: async () => 'gh_cli', invalidate: () => {} }),
    browserSignIn: browser
      ? { fetch, clientId: 'Iv1.test', userAgent: 'Plot/test', sleep: async () => {} }
      : undefined,
    now: () => new Date('2026-10-31T00:00:00Z'),
    createId: () => 'sign-in-1',
  });
  return { service, store, connections, clientFor };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body));
}

const deviceCode = {
  device_code: 'device-123',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};

describe('createAccountService', () => {
  it('adds an account from a personal access token after checking it with GitHub', async () => {
    const { service, store, clientFor } = setup();

    await expect(
      service.signInWithToken({ host: 'github.example.com', token: 'ghp_mona' }),
    ).resolves.toEqual({
      id: 'github.example.com/mona',
      host: 'github.example.com',
      login: 'Mona',
      avatarUrl: 'https://avatars.githubusercontent.com/Mona',
      method: 'token',
    });
    expect(clientFor).toHaveBeenCalledWith('github.example.com', expect.anything());
    expect(store.tokens.get('github.example.com/mona')).toEqual({ accessToken: 'ghp_mona' });
    await expect(service.listAccounts()).resolves.toMatchObject({
      currentId: 'github.example.com/mona',
      browserSignIn: true,
    });
  });

  it('does not save a token GitHub rejects', async () => {
    const { service, store } = setup();
    await expect(
      service.signInWithToken({ host: 'github.com', token: 'ghp_wrong' }),
    ).rejects.toMatchObject({ code: 'github-unauthorized' });
    expect((await store.read()).accounts).toEqual([]);
  });

  it('borrows the GitHub CLI login without storing its token', async () => {
    const { service, store } = setup();
    await expect(service.signInWithGitHubCli('github.com')).resolves.toMatchObject({
      id: 'github.com/hubot',
      method: 'github-cli',
    });
    expect(store.tokens.size).toBe(0);
  });

  it('signs in through the browser with a device code and keeps the refresh token', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(
        json({
          access_token: 'gho_browser',
          refresh_token: 'ghr_browser',
          expires_in: 28_800,
          refresh_token_expires_in: 15_897_600,
        }),
      );
    const { service, store } = setup({ fetch });

    await expect(service.startBrowserSignIn()).resolves.toEqual({
      id: 'sign-in-1',
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-10-31T00:15:00.000Z',
    });
    await expect(service.finishBrowserSignIn('sign-in-1')).resolves.toMatchObject({
      id: 'github.com/mona',
      method: 'browser',
    });
    const signedInAt = Date.parse('2026-10-31T00:00:00Z');
    expect(store.tokens.get('github.com/mona')).toEqual({
      accessToken: 'gho_browser',
      refreshToken: 'ghr_browser',
      expiresAt: signedInAt + 28_800_000,
      refreshTokenExpiresAt: signedInAt + 15_897_600_000,
    });
    await expect(service.finishBrowserSignIn('sign-in-1')).rejects.toMatchObject({
      code: 'sign-in-failed',
    });
  });

  it('stops waiting for the browser when the sign-in is cancelled', async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValueOnce(json(deviceCode));
    const { service } = setup({ fetch });
    const { id } = await service.startBrowserSignIn();
    await service.cancelBrowserSignIn(id);
    await expect(service.finishBrowserSignIn(id)).rejects.toMatchObject({
      code: 'sign-in-failed',
    });
  });

  it('says when this build has no app registered for browser sign-in', async () => {
    const { service } = setup({ browser: false });
    await expect(service.listAccounts()).resolves.toMatchObject({ browserSignIn: false });
    await expect(service.startBrowserSignIn()).rejects.toMatchObject({ code: 'sign-in-failed' });
  });

  it('forgets cached connections when accounts change', async () => {
    const { service, connections } = setup();
    await service.signInWithToken({ host: 'github.com', token: 'ghp_mona' });
    await service.removeAccount('github.com/mona');
    expect(connections.forget).toHaveBeenCalledWith('github.com/mona');
    expect(connections.forget).toHaveBeenCalledTimes(2);
  });
});
