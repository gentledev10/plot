import { isAccountId, type TokenSignIn } from '@shared/accounts';
import {
  type AiProviderId,
  type AiSettings,
  isAiProviderId,
  isApiKey,
  parseAiSettings,
} from '@shared/ai';
import { isThemeSource, type ThemeSource } from '@shared/appearance';
import { isObjectId } from '@shared/diff';
import { isFontFamily, isFontId } from '@shared/fonts';
import {
  PULL_REQUEST_SCOPES,
  PULL_REQUEST_STATE_FILTERS,
  type PullRequestRef,
  type RepositoryPullRequestQuery,
  type RepositoryRef,
} from '@shared/github';
import { isHost } from '@shared/hosts';
import type { IpcMethod, PlotApi } from '@shared/ipc';
import { isLocalCompare, isLocalRepositoryId, type LocalTarget } from '@shared/local';
import { isPullRequestRef } from '@shared/pull-request-ref';
import { isRepositoryRef } from '@shared/repository-ref';
import { AppError } from '../errors';

export type ArgumentParsers = {
  [K in IpcMethod]: (args: readonly unknown[]) => Parameters<PlotApi[K]>;
};

const TOKEN = /^[\x21-\x7e]{1,512}$/;
const SIGN_IN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const argumentParsers: ArgumentParsers = {
  listAccounts: () => [],
  switchAccount: ([id]) => [accountId(id)],
  removeAccount: ([id]) => [accountId(id)],
  signInWithToken: ([input]) => [tokenSignIn(input)],
  signInWithGitHubCli: ([value]) => [host(value)],
  startBrowserSignIn: () => [],
  finishBrowserSignIn: ([id]) => [signInId(id)],
  cancelBrowserSignIn: ([id]) => [signInId(id)],
  listInbox: () => [],
  getPullRequest: ([ref]) => [pullRequestRef(ref)],
  listAccessibleRepositories: () => [],
  findRepository: ([ref]) => [repositoryRef(ref)],
  countOpenPullRequests: ([ref]) => [repositoryRef(ref)],
  listRepositoryPullRequests: ([query]) => [repositoryPullRequestQuery(query)],
  getPullRequestDiff: ([ref]) => [pullRequestRef(ref)],
  readBlob: ([ref, blob]) => [pullRequestRef(ref), objectId(blob)],
  getReviewStatus: ([ref]) => [pullRequestRef(ref)],
  startReview: ([ref]) => [pullRequestRef(ref)],
  cancelReview: ([ref]) => [pullRequestRef(ref)],
  getAiSettings: () => [],
  updateAiSettings: ([settings]) => [aiSettings(settings)],
  detectAiProviders: () => [],
  listAiModels: ([provider]) => [aiProvider(provider)],
  saveAiApiKey: ([provider, key]) => [aiProvider(provider), apiKey(key)],
  removeAiApiKey: ([provider]) => [aiProvider(provider)],
  setThemeSource: ([source]) => [themeSource(source)],
  listInstalledFonts: () => [],
  listAddedFonts: () => [],
  addFonts: () => [],
  readAddedFont: ([id]) => [fontId(id)],
  removeAddedFont: ([family]) => [fontFamily(family)],
  getPreferences: () => [],
  setPreference: ([key, value]) => [preferenceKey(key), preferenceValue(value)],
  openLocalRepository: () => [],
  listLocalRepositories: () => [],
  removeLocalRepository: ([id]) => [localRepositoryId(id)],
  getLocalStatus: ([id]) => [localRepositoryId(id)],
  findLocalPullRequest: ([id]) => [localRepositoryId(id)],
  getLocalDiff: ([target]) => [localTarget(target)],
  getLocalSignature: ([target]) => [localTarget(target)],
  readLocalBlob: ([id, blob]) => [localRepositoryId(id), objectId(blob)],
  readLocalFile: ([id, path]) => [localRepositoryId(id), relativePath(path)],
};

function localRepositoryId(value: unknown): string {
  if (!isLocalRepositoryId(value)) {
    throw new AppError('invalid-argument', 'Expected a local repository id.');
  }
  return value;
}

function localTarget(value: unknown): LocalTarget {
  const { repositoryId, compare } = (value ?? {}) as Record<string, unknown>;
  if (!isLocalCompare(compare)) {
    throw new AppError('invalid-argument', 'Expected branch or uncommitted changes.');
  }
  return { repositoryId: localRepositoryId(repositoryId), compare };
}

function relativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.length > 4096 ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.split('/').includes('..')
  ) {
    throw new AppError('invalid-argument', 'Expected a path inside the repository.');
  }
  return value;
}

const PREFERENCE_KEY = /^[a-z][a-zA-Z0-9.-]{0,63}$/;
const MAX_PREFERENCE_BYTES = 64 * 1024;

function preferenceKey(value: unknown): string {
  if (typeof value !== 'string' || !PREFERENCE_KEY.test(value)) {
    throw new AppError('invalid-argument', 'Expected a preference name.');
  }
  return value;
}

function preferenceValue(value: unknown): unknown {
  const text = JSON.stringify(value ?? null);
  if (text.length > MAX_PREFERENCE_BYTES) {
    throw new AppError('invalid-argument', 'That preference is too large to save.');
  }
  return JSON.parse(text);
}

function themeSource(value: unknown): ThemeSource {
  if (!isThemeSource(value)) {
    throw new AppError('invalid-argument', 'Expected system, light, or dark.');
  }
  return value;
}

function fontId(value: unknown): string {
  if (!isFontId(value)) {
    throw new AppError('invalid-argument', 'Expected a font id.');
  }
  return value;
}

function fontFamily(value: unknown): string {
  if (!isFontFamily(value)) {
    throw new AppError('invalid-argument', 'Expected a font name.');
  }
  return value;
}

function aiProvider(value: unknown): AiProviderId {
  if (!isAiProviderId(value)) {
    throw new AppError('invalid-argument', 'Expected an AI tool.');
  }
  return value;
}

function apiKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!isApiKey(key)) {
    throw new AppError('invalid-argument', 'That does not look like an API key.');
  }
  return key;
}

function aiSettings(value: unknown): AiSettings {
  const settings = parseAiSettings(value);
  if (!settings) {
    throw new AppError('invalid-argument', 'Expected AI settings.');
  }
  return settings;
}

function pullRequestRef(value: unknown): PullRequestRef {
  if (!isPullRequestRef(value)) {
    throw new AppError('invalid-argument', 'Expected a pull request reference.');
  }
  return { host: value.host, owner: value.owner, repo: value.repo, number: value.number };
}

function repositoryRef(value: unknown): RepositoryRef {
  if (!isRepositoryRef(value)) {
    throw new AppError('invalid-argument', 'Expected a repository.');
  }
  return { host: value.host, owner: value.owner, repo: value.repo };
}

const SEARCH_TEXT = /^[^\p{Cc}]{0,256}$/u;

function repositoryPullRequestQuery(value: unknown): RepositoryPullRequestQuery {
  const { repository, state, scope, text, page } = (value ?? {}) as Record<string, unknown>;
  const stateFilter = PULL_REQUEST_STATE_FILTERS.find((candidate) => candidate === state);
  const scopeFilter = PULL_REQUEST_SCOPES.find((candidate) => candidate === scope);
  if (
    !stateFilter ||
    !scopeFilter ||
    typeof text !== 'string' ||
    !SEARCH_TEXT.test(text) ||
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100
  ) {
    throw new AppError('invalid-argument', 'Expected a page of pull requests.');
  }
  return {
    repository: repositoryRef(repository),
    state: stateFilter,
    scope: scopeFilter,
    text,
    page,
  };
}

function objectId(value: unknown): string {
  if (!isObjectId(value)) {
    throw new AppError('invalid-argument', 'Expected a git object id.');
  }
  return value;
}

function accountId(value: unknown): string {
  if (!isAccountId(value)) {
    throw new AppError('invalid-argument', 'Expected an account id.');
  }
  return value;
}

function host(value: unknown): string {
  if (!isHost(value)) {
    throw new AppError('invalid-argument', 'Expected a host name such as github.com.');
  }
  return value;
}

function tokenSignIn(value: unknown): TokenSignIn {
  if (typeof value !== 'object' || value === null) {
    throw new AppError('invalid-argument', 'Expected a host and a token.');
  }
  const { host: rawHost, token } = value as Record<string, unknown>;
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    throw new AppError('invalid-argument', 'That does not look like a GitHub token.');
  }
  return { host: host(rawHost), token };
}

function signInId(value: unknown): string {
  if (typeof value !== 'string' || !SIGN_IN_ID.test(value)) {
    throw new AppError('invalid-argument', 'Expected a sign-in id.');
  }
  return value;
}
