import { GITHUB_HOST } from '@shared/hosts';
import { AppError } from '../errors';
import { CommandError, type CommandRunner } from '../system/process';
import { type OAuthTokens, signInExpired } from './oauth';

export interface TokenProvider {
  getToken(): Promise<string>;
  invalidate(rejectedToken?: string): void;
}

const REFRESH_MARGIN_MS = 5 * 60_000;

interface StoredTokenOptions {
  read(): Promise<OAuthTokens>;
  save(tokens: OAuthTokens): Promise<void>;
  refresh?(refreshToken: string): Promise<OAuthTokens>;
  now?(): number;
}

export function storedTokens({
  read,
  save,
  refresh,
  now = Date.now,
}: StoredTokenOptions): TokenProvider {
  let pending: Promise<OAuthTokens> | undefined;
  let settled: OAuthTokens | undefined;
  let rejected = false;

  const isDue = (tokens: OAuthTokens) =>
    tokens.expiresAt !== undefined && now() >= tokens.expiresAt - REFRESH_MARGIN_MS;

  async function load(): Promise<OAuthTokens> {
    const tokens = await read();
    const due = isDue(tokens);
    if (!due && !rejected) {
      return tokens;
    }
    rejected = false;
    const refreshUsable =
      tokens.refreshToken !== undefined &&
      (tokens.refreshTokenExpiresAt === undefined || now() < tokens.refreshTokenExpiresAt);
    if (!refresh || !tokens.refreshToken || !refreshUsable) {
      if (due) {
        throw signInExpired();
      }
      return tokens;
    }
    const fresh = await refresh(tokens.refreshToken);
    await save(fresh);
    return fresh;
  }

  function current(): Promise<OAuthTokens> {
    if (!pending) {
      settled = undefined;
      pending = load().then(
        (tokens) => {
          settled = tokens;
          return tokens;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        },
      );
    }
    return pending;
  }

  // GitHub retires a refresh token once it is used, so a second refresh started while one is in
  // flight would fail. Only a token that is loaded and was rejected starts a new one.
  function discard(tokens: OAuthTokens | undefined): boolean {
    if (!settled || (tokens !== undefined && tokens !== settled)) {
      return false;
    }
    pending = undefined;
    settled = undefined;
    return true;
  }

  return {
    async getToken() {
      let tokens = await current();
      if (isDue(tokens)) {
        discard(tokens);
        tokens = await current();
      }
      return tokens.accessToken;
    },
    invalidate(rejectedToken) {
      if (rejectedToken !== undefined && rejectedToken !== settled?.accessToken) {
        return;
      }
      if (discard(undefined)) {
        rejected = true;
      }
    },
  };
}

export function cachedTokens(read: () => Promise<string>): TokenProvider {
  let pending: Promise<string> | undefined;
  return {
    getToken() {
      pending ??= read().catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
      return pending;
    },
    invalidate() {
      pending = undefined;
    },
  };
}

interface GhTokenOptions {
  host?: string;
  user?: string;
}

export function createGhTokenProvider(
  run: CommandRunner,
  { host = GITHUB_HOST, user }: GhTokenOptions = {},
): TokenProvider {
  const account = user ? `${host} as ${user}` : host;
  return cachedTokens(async () => {
    const args = ['auth', 'token', '--hostname', host, ...(user ? ['--user', user] : [])];
    try {
      const { stdout } = await run('gh', args, { timeoutMs: 10_000 });
      const token = stdout.trim();
      if (token !== '') {
        return token;
      }
    } catch (error) {
      if (error instanceof CommandError && error.failure === 'not-found') {
        throw new AppError(
          'gh-not-installed',
          'The GitHub CLI (gh) is not installed. Install it from https://cli.github.com.',
          { cause: error },
        );
      }
      throw notSignedIn(account, error);
    }
    throw notSignedIn(account);
  });
}

function notSignedIn(account: string, cause?: unknown): AppError {
  return new AppError(
    'gh-not-authenticated',
    `The GitHub CLI is not signed in to ${account}. Run \`gh auth login\` in a terminal.`,
    { cause },
  );
}
