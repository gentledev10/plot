import { isAccountId, type TokenSignIn } from '@shared/accounts';
import { type AiSettings, parseAiSettings } from '@shared/ai';
import { isObjectId } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import { isHost } from '@shared/hosts';
import type { IpcMethod, ViewerApi } from '@shared/ipc';
import { isPullRequestRef } from '@shared/pull-request-ref';
import { AppError } from '../errors';

export type ArgumentParsers = {
  [K in IpcMethod]: (args: readonly unknown[]) => Parameters<ViewerApi[K]>;
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
  getPullRequestDiff: ([ref]) => [pullRequestRef(ref)],
  readBlob: ([ref, blob]) => [pullRequestRef(ref), objectId(blob)],
  getReviewStatus: ([ref]) => [pullRequestRef(ref)],
  startReview: ([ref]) => [pullRequestRef(ref)],
  cancelReview: ([ref]) => [pullRequestRef(ref)],
  getAiSettings: () => [],
  updateAiSettings: ([settings]) => [aiSettings(settings)],
  detectAiProviders: () => [],
};

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
