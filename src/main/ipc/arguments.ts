import { isObjectId } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import type { IpcMethod, ViewerApi } from '@shared/ipc';
import { isPullRequestRef } from '@shared/pull-request-ref';
import { AppError } from '../errors';

export type ArgumentParsers = {
  [K in IpcMethod]: (args: readonly unknown[]) => Parameters<ViewerApi[K]>;
};

export const argumentParsers: ArgumentParsers = {
  getSession: () => [],
  listInbox: () => [],
  getPullRequest: ([ref]) => [pullRequestRef(ref)],
  getPullRequestDiff: ([ref]) => [pullRequestRef(ref)],
  readBlob: ([ref, blob]) => [pullRequestRef(ref), objectId(blob)],
  getReviewStatus: ([ref]) => [pullRequestRef(ref)],
  startReview: ([ref]) => [pullRequestRef(ref)],
  cancelReview: ([ref]) => [pullRequestRef(ref)],
};

function pullRequestRef(value: unknown): PullRequestRef {
  if (!isPullRequestRef(value)) {
    throw new AppError('invalid-argument', 'Expected a pull request reference.');
  }
  return { owner: value.owner, repo: value.repo, number: value.number };
}

function objectId(value: unknown): string {
  if (!isObjectId(value)) {
    throw new AppError('invalid-argument', 'Expected a git object id.');
  }
  return value;
}
