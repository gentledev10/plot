import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../accounts/account-store';
import { apiKeyFor, createApiKeyStore } from './api-key-store';

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

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'plot-api-keys-'));
  file = join(dir, 'ai-api-keys.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createApiKeyStore', () => {
  it('starts with no keys', async () => {
    const store = createApiKeyStore({ file, cipher });
    await expect(store.has('claude-code')).resolves.toBe(false);
    await expect(store.read('claude-code')).resolves.toBeUndefined();
  });

  it('keeps a key per tool, sealed, in a private file', async () => {
    const store = createApiKeyStore({ file, cipher });
    await store.save('claude-code', 'sk-ant-api03-secret-value');
    await store.save('codex', 'sk-proj-other-secret-value');

    await expect(store.read('claude-code')).resolves.toBe('sk-ant-api03-secret-value');
    await expect(createApiKeyStore({ file, cipher }).read('codex')).resolves.toBe(
      'sk-proj-other-secret-value',
    );
    const written = await readFile(file, 'utf8');
    expect(written).not.toContain('secret-value');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('forgets a removed key and keeps the others', async () => {
    const store = createApiKeyStore({ file, cipher });
    await store.save('claude-code', 'sk-ant-api03-secret-value');
    await store.save('codex', 'sk-proj-other-secret-value');

    await store.remove('claude-code');

    await expect(store.has('claude-code')).resolves.toBe(false);
    await expect(store.has('codex')).resolves.toBe(true);
  });

  it('refuses to save a key when the keychain is unavailable', async () => {
    const store = createApiKeyStore({ file, cipher: { ...cipher, isAvailable: () => false } });
    await expect(store.save('codex', 'sk-proj-other-secret-value')).rejects.toMatchObject({
      code: 'secure-storage-unavailable',
    });
  });

  it('reports a key the keychain can no longer unlock', async () => {
    await writeFile(file, JSON.stringify({ version: 1, keys: { codex: 'bm90IHNlYWxlZA==' } }));
    await expect(createApiKeyStore({ file, cipher }).read('codex')).rejects.toMatchObject({
      code: 'secure-storage-unavailable',
    });
  });

  it('treats a corrupted file as having no keys', async () => {
    await writeFile(file, '{not json');
    await expect(createApiKeyStore({ file, cipher }).has('codex')).resolves.toBe(false);
  });
});

describe('apiKeyFor', () => {
  const settings = { provider: 'claude-code' as const, models: {} };

  it('gives no key when the tool uses its own sign-in', async () => {
    const keys = { read: async () => 'sk-ant-api03-secret-value' };
    await expect(apiKeyFor(keys, { ...settings, auth: {} })).resolves.toBeUndefined();
  });

  it('gives the saved key when the tool is set to use one', async () => {
    const keys = { read: async () => 'sk-ant-api03-secret-value' };
    await expect(
      apiKeyFor(keys, { ...settings, auth: { 'claude-code': 'api-key' } }),
    ).resolves.toBe('sk-ant-api03-secret-value');
  });

  it('says where to add a key that is chosen but missing', async () => {
    const keys = { read: async () => undefined };
    await expect(
      apiKeyFor(keys, { ...settings, auth: { 'claude-code': 'api-key' } }),
    ).rejects.toMatchObject({
      code: 'ai-not-configured',
      message: expect.stringContaining('Anthropic API key'),
    });
  });
});
