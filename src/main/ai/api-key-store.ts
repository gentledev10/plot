import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiProviderId,
  type AiSettings,
  authOf,
} from '@shared/ai';
import type { SecretCipher } from '../accounts/account-store';
import { AppError } from '../errors';

export interface ApiKeyStore {
  has(id: AiProviderId): Promise<boolean>;
  read(id: AiProviderId): Promise<string | undefined>;
  save(id: AiProviderId, key: string): Promise<void>;
  remove(id: AiProviderId): Promise<void>;
}

interface ApiKeyStoreOptions {
  file: string;
  cipher: SecretCipher;
}

type SealedKeys = Partial<Record<AiProviderId, string>>;

export function createApiKeyStore({ file, cipher }: ApiKeyStoreOptions): ApiKeyStore {
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  async function load(): Promise<SealedKeys> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
    try {
      return parseKeys(JSON.parse(text));
    } catch {
      return {};
    }
  }

  async function persist(keys: SealedKeys): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, keys }, null, 2), { mode: 0o600 });
    await rename(temporary, file);
  }

  return {
    async has(id) {
      return (await exclusive(load))[id] !== undefined;
    },

    async read(id) {
      const sealed = (await exclusive(load))[id];
      if (sealed === undefined) {
        return undefined;
      }
      try {
        return cipher.decrypt(Buffer.from(sealed, 'base64'));
      } catch (error) {
        throw new AppError(
          'secure-storage-unavailable',
          'Could not unlock the saved API key with the keychain. Add it again in Settings > AI overview.',
          { cause: error },
        );
      }
    },

    save(id, key) {
      return exclusive(async () => {
        if (!cipher.isAvailable()) {
          throw new AppError(
            'secure-storage-unavailable',
            'The keychain is not available, so the API key cannot be saved.',
          );
        }
        const keys = await load();
        await persist({ ...keys, [id]: cipher.encrypt(key).toString('base64') });
      });
    },

    remove(id) {
      return exclusive(async () => {
        const { [id]: _removed, ...rest } = await load();
        await persist(rest);
      });
    },
  };
}

export async function apiKeyFor(
  keys: Pick<ApiKeyStore, 'read'>,
  settings: AiSettings,
): Promise<string | undefined> {
  const { provider } = settings;
  if (authOf(settings, provider) !== 'api-key') {
    return undefined;
  }
  const key = await keys.read(provider);
  if (!key) {
    const { name, apiKeyVendor } = AI_PROVIDERS[provider];
    throw new AppError(
      'ai-not-configured',
      `Add your ${apiKeyVendor} API key in Settings > AI overview, or let ${name} use its own sign-in.`,
    );
  }
  return key;
}

function parseKeys(value: unknown): SealedKeys {
  const keys = (value as { keys?: unknown } | null)?.keys;
  const parsed: SealedKeys = {};
  if (typeof keys !== 'object' || keys === null) {
    return parsed;
  }
  for (const id of AI_PROVIDER_IDS) {
    const sealed = (keys as Record<string, unknown>)[id];
    if (typeof sealed === 'string') {
      parsed[id] = sealed;
    }
  }
  return parsed;
}
