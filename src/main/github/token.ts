import { GITHUB_HOST } from '@shared/hosts';
import { AppError } from '../errors';
import { CommandError, type CommandRunner } from '../system/process';

export interface TokenProvider {
  getToken(): Promise<string>;
  invalidate(): void;
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
