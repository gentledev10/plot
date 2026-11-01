import { isHost } from './hosts';

export type AccountMethod = 'browser' | 'token' | 'github-cli';

export interface Account {
  id: string;
  host: string;
  login: string;
  avatarUrl: string;
  method: AccountMethod;
}

export interface AccountList {
  accounts: Account[];
  currentId?: string;
  browserSignIn: boolean;
}

export type BrowserSignIn =
  | { id: string; flow: 'web'; authorizeUrl: string }
  | { id: string; flow: 'device'; userCode: string; verificationUri: string; expiresAt: string };

export interface TokenSignIn {
  host: string;
  token: string;
}

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,98}[A-Za-z0-9_])?$/;

export function accountId(host: string, login: string): string {
  return `${host}/${login.toLowerCase()}`;
}

export function isAccountId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const slash = value.indexOf('/');
  const login = value.slice(slash + 1);
  return slash > 0 && isHost(value.slice(0, slash)) && LOGIN.test(login);
}
