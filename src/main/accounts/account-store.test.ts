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
  dir = await mkdtemp(join(tmpdir(), 'plot-accounts-'));
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
    await store.save(account('mona'), { accessToken: 'ghp_mona' });
    await store.save(account('hubot'), { accessToken: 'ghp_hubot' });

    const { accounts, currentId } = await store.read();
    expect(accounts.map((item) => item.login)).toEqual(['mona', 'hubot']);
    expect(currentId).toBe('github.com/hubot');
    expect(JSON.stringify(accounts)).not.toContain('ghp_');
    await expect(store.readTokens('github.com/mona')).resolves.toEqual({ accessToken: 'ghp_mona' });
  });

  it('never writes a token in plain text, and keeps the file private', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), { accessToken: 'ghp_secret_value' });

    expect(await readFile(file, 'utf8')).not.toContain('ghp_secret_value');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('replaces an account that signs in again', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), { accessToken: 'old' });
    await store.save(account('mona', { method: 'browser' }), { accessToken: 'new' });

    const { accounts } = await store.read();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.method).toBe('browser');
    await expect(store.readTokens('github.com/mona')).resolves.toEqual({ accessToken: 'new' });
  });

  it('seals refresh tokens too and returns them with their expiry', async () => {
    const store = createAccountStore({ file, cipher });
    const tokens = {
      accessToken: 'ghu_access',
      refreshToken: 'ghr_refresh',
      expiresAt: 1_000,
      refreshTokenExpiresAt: 2_000,
    };
    await store.save(account('mona', { method: 'browser' }), tokens);

    const written = await readFile(file, 'utf8');
    expect(written).not.toContain('ghu_access');
    expect(written).not.toContain('ghr_refresh');
    expect((await store.read()).accounts).toEqual([account('mona', { method: 'browser' })]);
    await expect(
      createAccountStore({ file, cipher }).readTokens('github.com/mona'),
    ).resolves.toEqual(tokens);
  });

  it('stores refreshed tokens without switching the current account', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona', { method: 'browser' }), {
      accessToken: 'old',
      refreshToken: 'r1',
      expiresAt: 1,
    });
    await store.save(account('hubot'), { accessToken: 'ghp_hubot' });

    await store.saveTokens('github.com/mona', {
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: 2,
    });

    expect((await store.read()).currentId).toBe('github.com/hubot');
    await expect(store.readTokens('github.com/mona')).resolves.toEqual({
      accessToken: 'new',
      refreshToken: 'r2',
      expiresAt: 2,
    });
  });

  it('does not bring back an account removed while its tokens were refreshed', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona', { method: 'browser' }), { accessToken: 'old' });
    await store.remove('github.com/mona');

    await store.saveTokens('github.com/mona', { accessToken: 'new' });

    expect((await store.read()).accounts).toEqual([]);
  });

  it('switches and removes accounts, moving the current one when needed', async () => {
    const store = createAccountStore({ file, cipher });
    await store.save(account('mona'), { accessToken: 'a' });
    await store.save(account('hubot'), { accessToken: 'b' });

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
    await expect(store.readTokens('github.com/mona')).rejects.toMatchObject({
      code: 'github-unauthorized',
    });
  });

  it('refuses to save a token when the keychain is unavailable', async () => {
    const store = createAccountStore({ file, cipher: { ...cipher, isAvailable: () => false } });
    await expect(store.save(account('mona'), { accessToken: 'ghp_x' })).rejects.toMatchObject({
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
      createAccountStore({ file, cipher }).readTokens('github.com/mona'),
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
