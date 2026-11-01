import { randomUUID } from 'node:crypto';
import { type Account, type AccountMethod, accountId } from '@shared/accounts';
import { GITHUB_HOST } from '@shared/hosts';
import type { PlotApi } from '@shared/ipc';
import type { AccountStore } from '../accounts/account-store';
import { AppError } from '../errors';
import type { GitHubClient } from '../github/client';
import type { GitHubConnections } from '../github/connections';
import {
  type DeviceCodeGrant,
  requestDeviceCode,
  type Sleep,
  waitForAccessToken,
} from '../github/device-flow';
import type { OAuthClient, OAuthTokens } from '../github/oauth';
import { cachedTokens, type TokenProvider } from '../github/token';
import { startWebSignIn, type WebSignIn } from '../github/web-flow';

export type AccountService = Pick<
  PlotApi,
  | 'listAccounts'
  | 'switchAccount'
  | 'removeAccount'
  | 'signInWithToken'
  | 'signInWithGitHubCli'
  | 'startBrowserSignIn'
  | 'finishBrowserSignIn'
  | 'cancelBrowserSignIn'
>;

export const BROWSER_SIGN_IN_SCOPES = ['repo'] as const;

export interface BrowserSignInApp extends OAuthClient {
  sleep?: Sleep;
}

interface AccountServiceOptions {
  store: AccountStore;
  connections: Pick<GitHubConnections, 'forget'>;
  clientFor(host: string, tokens: TokenProvider): GitHubClient;
  gitHubCliTokens(host: string): TokenProvider;
  browserSignIn?: BrowserSignInApp;
  now?(): Date;
  createId?(): string;
}

type PendingSignIn =
  | { flow: 'web'; signIn: WebSignIn }
  | { flow: 'device'; grant: DeviceCodeGrant; controller: AbortController };

export function createAccountService({
  store,
  connections,
  clientFor,
  gitHubCliTokens,
  browserSignIn,
  now = () => new Date(),
  createId = randomUUID,
}: AccountServiceOptions): AccountService {
  const pending = new Map<string, PendingSignIn>();

  async function identify(
    host: string,
    tokens: TokenProvider,
    method: AccountMethod,
  ): Promise<Account> {
    const user = await clientFor(host, tokens).getViewer();
    return {
      id: accountId(host, user.login),
      host,
      login: user.login,
      avatarUrl: user.avatarUrl,
      method,
    };
  }

  async function add(account: Account, tokens?: OAuthTokens): Promise<Account> {
    await store.save(account, tokens);
    connections.forget(account.id);
    return account;
  }

  return {
    async listAccounts() {
      const { accounts, currentId } = await store.read();
      return { accounts, currentId, browserSignIn: browserSignIn !== undefined };
    },

    async switchAccount(id) {
      await store.setCurrent(id);
    },

    async removeAccount(id) {
      await store.remove(id);
      connections.forget(id);
    },

    async signInWithToken({ host, token }) {
      return add(
        await identify(
          host,
          cachedTokens(async () => token),
          'token',
        ),
        { accessToken: token },
      );
    },

    async signInWithGitHubCli(host) {
      return add(await identify(host, gitHubCliTokens(host), 'github-cli'));
    },

    async startBrowserSignIn() {
      if (!browserSignIn) {
        throw new AppError(
          'sign-in-failed',
          'This build of Plot cannot sign in with a browser. Use a token or the GitHub CLI.',
        );
      }
      const id = createId();
      const { clientSecret } = browserSignIn;
      if (clientSecret) {
        const signIn = await startWebSignIn(
          { ...browserSignIn, clientSecret },
          BROWSER_SIGN_IN_SCOPES,
          {
            now: () => now().getTime(),
          },
        );
        pending.set(id, { flow: 'web', signIn });
        return { id, flow: 'web', authorizeUrl: signIn.authorizeUrl };
      }
      const grant = await requestDeviceCode(browserSignIn, BROWSER_SIGN_IN_SCOPES);
      pending.set(id, { flow: 'device', grant, controller: new AbortController() });
      return {
        id,
        flow: 'device',
        userCode: grant.userCode,
        verificationUri: grant.verificationUri,
        expiresAt: new Date(now().getTime() + grant.expiresInSeconds * 1_000).toISOString(),
      };
    },

    async finishBrowserSignIn(id) {
      const signIn = pending.get(id);
      if (!signIn || !browserSignIn) {
        throw new AppError('sign-in-failed', 'This sign-in is no longer in progress. Start again.');
      }
      try {
        const tokens =
          signIn.flow === 'web'
            ? await signIn.signIn.tokens
            : await waitForAccessToken(browserSignIn, signIn.grant, {
                signal: signIn.controller.signal,
                sleep: browserSignIn.sleep,
                now: () => now().getTime(),
              });
        return await add(
          await identify(
            GITHUB_HOST,
            cachedTokens(async () => tokens.accessToken),
            'browser',
          ),
          tokens,
        );
      } finally {
        pending.delete(id);
      }
    },

    async cancelBrowserSignIn(id) {
      const signIn = pending.get(id);
      if (signIn?.flow === 'web') {
        signIn.signIn.cancel();
      } else {
        signIn?.controller.abort();
      }
      pending.delete(id);
    },
  };
}
