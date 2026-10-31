import type { Account } from '@shared/accounts';
import type { AccountStore } from '../accounts/account-store';
import { AppError } from '../errors';
import type { GitHubClient } from './client';

export interface GitHubConnection {
  account: Account;
  client: GitHubClient;
  authHeader(): Promise<string>;
}

export interface GitHubConnections {
  current(): Promise<GitHubConnection>;
  forHost(host: string): Promise<GitHubConnection>;
  forget(id: string): void;
}

interface ConnectionsOptions {
  store: Pick<AccountStore, 'read'>;
  connect(account: Account): GitHubConnection;
}

export function createConnections({ store, connect }: ConnectionsOptions): GitHubConnections {
  const connections = new Map<string, GitHubConnection>();

  function connectionFor(account: Account): GitHubConnection {
    const cached = connections.get(account.id);
    if (cached?.account.method === account.method) {
      return cached;
    }
    const connection = connect(account);
    connections.set(account.id, connection);
    return connection;
  }

  return {
    async current() {
      const { accounts, currentId } = await store.read();
      const account = accounts.find((candidate) => candidate.id === currentId);
      if (!account) {
        throw new AppError('github-no-account', 'Connect a GitHub account to get started.');
      }
      return connectionFor(account);
    },

    async forHost(host) {
      const { accounts, currentId } = await store.read();
      const onHost = accounts.filter((candidate) => candidate.host === host);
      const account = onHost.find((candidate) => candidate.id === currentId) ?? onHost[0];
      if (!account) {
        throw new AppError(
          'github-no-account',
          `No account for ${host} is connected. Add one in Settings > Accounts.`,
        );
      }
      return connectionFor(account);
    },

    forget(id) {
      connections.delete(id);
    },
  };
}
