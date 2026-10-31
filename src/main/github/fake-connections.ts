import type { Account } from '@shared/accounts';
import { AppError } from '../errors';
import type { GitHubClient } from './client';
import type { GitHubConnections } from './connections';

export const testAccount: Account = {
  id: 'github.com/octocat',
  host: 'github.com',
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/1',
  method: 'token',
};

export function fakeConnections(client: GitHubClient, account = testAccount): GitHubConnections {
  const connection = { account, client, authHeader: async () => 'Basic test' };
  return {
    current: async () => connection,
    forHost: async (host) => {
      if (host !== account.host) {
        throw new AppError('github-no-account', `No account for ${host}.`);
      }
      return connection;
    },
    forget: () => {},
  };
}
