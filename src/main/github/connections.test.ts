import type { Account } from '@shared/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from './client';
import { createConnections, type GitHubConnection } from './connections';

function account(id: string, method: Account['method'] = 'token'): Account {
  const [host = '', login = ''] = id.split('/');
  return { id, host, login, avatarUrl: '', method };
}

function setup(accounts: Account[], currentId?: string) {
  const store = { read: vi.fn().mockImplementation(async () => ({ accounts, currentId })) };
  const connect = vi.fn(
    (target: Account): GitHubConnection => ({
      account: target,
      client: {} as GitHubClient,
      authHeader: async () => `header for ${target.id}`,
    }),
  );
  return { connections: createConnections({ store, connect }), connect };
}

describe('createConnections', () => {
  const personal = account('github.com/mona');
  const work = account('github.com/mona-corp');
  const enterprise = account('github.example.com/mona');

  it('uses the current account for the inbox', async () => {
    const { connections } = setup([personal, work], work.id);
    await expect(connections.current()).resolves.toMatchObject({ account: work });
  });

  it('prefers the current account for a host, then any account on that host', async () => {
    const { connections } = setup([personal, work, enterprise], work.id);
    await expect(connections.forHost('github.com')).resolves.toMatchObject({ account: work });
    await expect(connections.forHost('github.example.com')).resolves.toMatchObject({
      account: enterprise,
    });
  });

  it('explains which host needs an account', async () => {
    const { connections } = setup([personal], personal.id);
    await expect(connections.forHost('github.example.com')).rejects.toMatchObject({
      code: 'github-no-account',
      message: expect.stringContaining('github.example.com'),
    });
    await expect(setup([]).connections.current()).rejects.toMatchObject({
      code: 'github-no-account',
    });
  });

  it('reuses a connection until the account is forgotten or signs in another way', async () => {
    const accounts = [personal];
    const { connections, connect } = setup(accounts, personal.id);

    await connections.current();
    await connections.current();
    expect(connect).toHaveBeenCalledTimes(1);

    connections.forget(personal.id);
    await connections.current();
    expect(connect).toHaveBeenCalledTimes(2);

    accounts[0] = account(personal.id, 'github-cli');
    await connections.current();
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
