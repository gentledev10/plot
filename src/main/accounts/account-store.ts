import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Account, type AccountMethod, isAccountId } from '@shared/accounts';
import { isHost } from '@shared/hosts';
import { AppError } from '../errors';
import type { OAuthTokens } from '../github/oauth';

export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

export interface StoredAccounts {
  accounts: Account[];
  currentId?: string;
}

export interface AccountStore {
  read(): Promise<StoredAccounts>;
  save(account: Account, tokens?: OAuthTokens): Promise<void>;
  saveTokens(id: string, tokens: OAuthTokens): Promise<void>;
  remove(id: string): Promise<void>;
  setCurrent(id: string): Promise<void>;
  readTokens(id: string): Promise<OAuthTokens>;
}

interface AccountStoreOptions {
  file: string;
  cipher: SecretCipher;
}

interface SealedTokens {
  secret?: string;
  refreshSecret?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
}

type StoredAccount = Account & SealedTokens;

interface AccountsFile {
  version: 1;
  currentId?: string;
  accounts: StoredAccount[];
}

const METHODS: ReadonlySet<AccountMethod> = new Set(['browser', 'token', 'github-cli']);

export function createAccountStore({ file, cipher }: AccountStoreOptions): AccountStore {
  let queue: Promise<unknown> = Promise.resolve();
  let cached: AccountsFile | undefined;

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  async function load(): Promise<AccountsFile> {
    cached ??= await readAccountsFile();
    return cached;
  }

  async function readAccountsFile(): Promise<AccountsFile> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, accounts: [] };
      }
      throw error;
    }
    try {
      return parseAccountsFile(JSON.parse(text));
    } catch {
      return { version: 1, accounts: [] };
    }
  }

  async function persist(data: AccountsFile): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    cached = data;
  }

  function encrypt(text: string): string {
    if (!cipher.isAvailable()) {
      throw new AppError(
        'secure-storage-unavailable',
        'The keychain is not available, so the sign-in cannot be saved.',
      );
    }
    return cipher.encrypt(text).toString('base64');
  }

  function decrypt(sealed: string): string {
    try {
      return cipher.decrypt(Buffer.from(sealed, 'base64'));
    } catch (error) {
      throw new AppError(
        'secure-storage-unavailable',
        'Could not unlock the saved sign-in with the keychain. Sign in again in Settings > Accounts.',
        { cause: error },
      );
    }
  }

  function seal(tokens: OAuthTokens): SealedTokens {
    return {
      secret: encrypt(tokens.accessToken),
      ...(tokens.refreshToken !== undefined && { refreshSecret: encrypt(tokens.refreshToken) }),
      ...(tokens.expiresAt !== undefined && { expiresAt: tokens.expiresAt }),
      ...(tokens.refreshTokenExpiresAt !== undefined && {
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      }),
    };
  }

  return {
    async read() {
      const data = await exclusive(load);
      return { accounts: data.accounts.map(publicAccount), currentId: currentIdOf(data) };
    },

    save(account, tokens) {
      return exclusive(async () => {
        const data = await load();
        const entry: StoredAccount = tokens ? { ...account, ...seal(tokens) } : account;
        const others = data.accounts.filter((candidate) => candidate.id !== account.id);
        await persist({ version: 1, currentId: account.id, accounts: [...others, entry] });
      });
    },

    saveTokens(id, tokens) {
      return exclusive(async () => {
        const data = await load();
        const existing = data.accounts.find((account) => account.id === id);
        if (!existing) {
          return;
        }
        const entry: StoredAccount = { ...publicAccount(existing), ...seal(tokens) };
        const accounts = data.accounts.map((account) => (account.id === id ? entry : account));
        await persist({ ...data, accounts });
      });
    },

    remove(id) {
      return exclusive(async () => {
        const data = await load();
        const accounts = data.accounts.filter((account) => account.id !== id);
        const currentId = currentIdOf({ ...data, accounts });
        await persist({ version: 1, currentId, accounts });
      });
    },

    setCurrent(id) {
      return exclusive(async () => {
        const data = await load();
        if (!data.accounts.some((account) => account.id === id)) {
          throw new AppError('github-no-account', 'That account is no longer connected.');
        }
        await persist({ ...data, currentId: id });
      });
    },

    async readTokens(id) {
      const data = await exclusive(load);
      const stored = data.accounts.find((account) => account.id === id);
      if (!stored?.secret) {
        throw new AppError(
          'github-unauthorized',
          'There is no saved sign-in for this account. Sign in again in Settings > Accounts.',
        );
      }
      return {
        accessToken: decrypt(stored.secret),
        ...(stored.refreshSecret !== undefined && {
          refreshToken: decrypt(stored.refreshSecret),
        }),
        ...(stored.expiresAt !== undefined && { expiresAt: stored.expiresAt }),
        ...(stored.refreshTokenExpiresAt !== undefined && {
          refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
        }),
      };
    },
  };
}

function publicAccount({ id, host, login, avatarUrl, method }: StoredAccount): Account {
  return { id, host, login, avatarUrl, method };
}

function currentIdOf(data: Pick<AccountsFile, 'accounts' | 'currentId'>): string | undefined {
  return data.accounts.some((account) => account.id === data.currentId)
    ? data.currentId
    : data.accounts[0]?.id;
}

function parseAccountsFile(value: unknown): AccountsFile {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const accounts = Array.isArray(record.accounts) ? record.accounts.flatMap(parseAccount) : [];
  const currentId = typeof record.currentId === 'string' ? record.currentId : undefined;
  return { version: 1, currentId, accounts };
}

function parseAccount(value: unknown): StoredAccount[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const fields = value as Record<string, unknown>;
  const { id, host, login, avatarUrl, method } = fields;
  if (
    !isAccountId(id) ||
    !isHost(host) ||
    typeof login !== 'string' ||
    typeof avatarUrl !== 'string' ||
    !METHODS.has(method as AccountMethod)
  ) {
    return [];
  }
  const account: StoredAccount = { id, host, login, avatarUrl, method: method as AccountMethod };
  if (typeof fields.secret === 'string') {
    account.secret = fields.secret;
  }
  if (typeof fields.refreshSecret === 'string') {
    account.refreshSecret = fields.refreshSecret;
  }
  if (typeof fields.expiresAt === 'number') {
    account.expiresAt = fields.expiresAt;
  }
  if (typeof fields.refreshTokenExpiresAt === 'number') {
    account.refreshTokenExpiresAt = fields.refreshTokenExpiresAt;
  }
  return [account];
}
