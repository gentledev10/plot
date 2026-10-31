import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Account } from '@shared/accounts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccountStore, type SecretCipher } from './account-store';

const cipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (text) => Buffer.from(`sealed:${[...text].reverse().join('')}`),
  decrypt: (data) => {
    const text = data.toString();
    if (!text.startsWith('sealed:')) {
      throw new Error('not sealed');
    }
    return [...text.slice('sealed:'.length)].reverse().join('');
  },
};

function account(login: string, overrides: Partial<Account> = {}): Account {
  return {
    id: `github.com/${login}`,
    host: 'github.com',
    login,
    avatarUrl: `https://avatars.githubusercontent.com/u/1?login=${login}`,
    method: 'token',
    ...overrides,
  };
}

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'viewer-accounts-'));
  file = join(dir, 'accounts.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createAccountStore', () => {
  it('starts empty', async () => {
    await expect(createAccountStore({ file, cipher }).read()).resolves.toEqual({
      accounts: [],
      currentId: undefined,
    });
  });

  it('saves accounts, makes the newest current, and returns tokens only on request', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), 'ghp_mona');
    await store.save(account('hubot'), 'ghp_hubot');

    const { accounts, currentId } = await store.read();
    expect(accounts.map((item) => item.login)).toEqual(['mona', 'hubot']);
    expect(currentId).toBe('github.com/hubot');
    expect(JSON.stringify(accounts)).not.toContain('ghp_');
    await expect(store.readToken('github.com/mona')).resolves.toBe('ghp_mona');
  });

  it('never writes a token in plain text, and keeps the file private', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), 'ghp_secret_value');

    expect(await readFile(file, 'utf8')).not.toContain('ghp_secret_value');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('replaces an account that signs in again', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), 'old');
    await store.save(account('mona', { method: 'browser' }), 'new');

    const { accounts } = await store.read();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.method).toBe('browser');
    await expect(store.readToken('github.com/mona')).resolves.toBe('new');
  });

  it('switches and removes accounts, moving the current one when needed', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), 'a');
    await store.save(account('hubot'), 'b');

    await store.setCurrent('github.com/mona');
    expect((await store.read()).currentId).toBe('github.com/mona');

    await store.remove('github.com/mona');
    expect(await store.read()).toMatchObject({ currentId: 'github.com/hubot' });
    await expect(store.setCurrent('github.com/mona')).rejects.toMatchObject({
      code: 'github-no-account',
    });
  });

  it('keeps no token for accounts that borrow the GitHub CLI login', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona', { method: 'github-cli' }));
    await expect(store.readToken('github.com/mona')).rejects.toMatchObject({
      code: 'github-unauthorized',
    });
  });

  it('refuses to save a token when the keychain is unavailable', async () => {
    const store = createAccountStore({ file, cipher: { ...cipher, isAvailable: () => false } });
    await expect(store.save(account('mona'), 'ghp_x')).rejects.toMatchObject({
      code: 'secure-storage-unavailable',
    });
    expect((await store.read()).accounts).toEqual([]);
  });

  it('reports a token the keychain can no longer unlock', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        accounts: [{ ...account('mona'), secret: 'bm90IHNlYWxlZA==' }],
      }),
    );
    await expect(
      createAccountStore({ file, cipher }).readToken('github.com/mona'),
    ).rejects.toMatchObject({ code: 'secure-storage-unavailable' });
  });

  it('skips entries it does not recognize instead of failing', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        currentId: 'github.com/ghost',
        accounts: [
          account('mona'),
          { ...account('evil'), host: '../etc' },
          { ...account('odd'), method: 'magic' },
          'garbage',
        ],
      }),
    );
    await expect(createAccountStore({ file, cipher }).read()).resolves.toEqual({
      accounts: [account('mona')],
      currentId: 'github.com/mona',
    });
  });

  it('treats a corrupted file as having no accounts', async () => {
    await writeFile(file, '{not json');
    await expect(createAccountStore({ file, cipher }).read()).resolves.toMatchObject({
      accounts: [],
    });
  });
});
