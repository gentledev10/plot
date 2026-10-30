import { AppError } from '../errors';
import { CommandError, type CommandRunner } from '../system/process';

export interface TokenProvider {
  getToken(): Promise<string>;
  invalidate(): void;
}

export function createGhTokenProvider(run: CommandRunner, host = 'github.com'): TokenProvider {
  let pending: Promise<string> | undefined;

  async function readToken(): Promise<string> {
    try {
      const { stdout } = await run('gh', ['auth', 'token', '--hostname', host], {
        timeoutMs: 10_000,
      });
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
      throw notSignedIn(host, error);
    }
    throw notSignedIn(host);
  }

  return {
    getToken() {
      pending ??= readToken().catch((error: unknown) => {
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

function notSignedIn(host: string, cause?: unknown): AppError {
  return new AppError(
    'gh-not-authenticated',
    `The GitHub CLI is not signed in to ${host}. Run \`gh auth login\` in a terminal.`,
    { cause },
  );
}
