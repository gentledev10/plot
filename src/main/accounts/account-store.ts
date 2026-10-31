import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Account, type AccountMethod, isAccountId } from '@shared/accounts';
import { isHost } from '@shared/hosts';
import { AppError } from '../errors';

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
  save(account: Account, token?: string): Promise<void>;
  remove(id: string): Promise<void>;
  setCurrent(id: string): Promise<void>;
  readToken(id: string): Promise<string>;
}

interface AccountStoreOptions {
  file: string;
  cipher: SecretCipher;
}

type StoredAccount = Account & { secret?: string };

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

  function encrypt(token: string): string {
    if (!cipher.isAvailable()) {
      throw new AppError(
        'secure-storage-unavailable',
        'The keychain is not available, so the sign-in cannot be saved.',
      );
    }
    return cipher.encrypt(token).toString('base64');
  }

  return {
    async read() {
      const data = await exclusive(load);
      return {
        accounts: data.accounts.map(({ secret: _secret, ...account }) => account),
        currentId: currentIdOf(data),
      };
    },

    save(account, token) {
      return exclusive(async () => {
        const data = await load();
        const entry: StoredAccount =
          token === undefined ? account : { ...account, secret: encrypt(token) };
        const others = data.accounts.filter((candidate) => candidate.id !== account.id);
        await persist({ version: 1, currentId: account.id, accounts: [...others, entry] });
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

    async readToken(id) {
      const data = await exclusive(load);
      const secret = data.accounts.find((account) => account.id === id)?.secret;
      if (!secret) {
        throw new AppError(
          'github-unauthorized',
          'There is no saved sign-in for this account. Sign in again in Settings > Accounts.',
        );
      }
      try {
        return cipher.decrypt(Buffer.from(secret, 'base64'));
      } catch (error) {
        throw new AppError(
          'secure-storage-unavailable',
          'Could not unlock the saved sign-in with the keychain. Sign in again in Settings > Accounts.',
          { cause: error },
        );
      }
    },
  };
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
  const { id, host, login, avatarUrl, method, secret } = value as Record<string, unknown>;
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
  if (typeof secret === 'string') {
    account.secret = secret;
  }
  return [account];
}
