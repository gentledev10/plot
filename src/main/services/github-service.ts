import type { Session } from '@shared/github';
import type { ViewerApi } from '@shared/ipc';
import { AppError } from '../errors';
import type { GitHubClient } from '../github/client';

export const INBOX_QUERIES = {
  reviewRequested: 'is:pr is:open archived:false review-requested:@me',
  authored: 'is:pr is:open archived:false author:@me',
} as const;

const INBOX_LIMIT = 50;

export type GitHubService = Pick<ViewerApi, 'getSession' | 'listInbox' | 'getPullRequest'>;

export function createGitHubService(client: GitHubClient): GitHubService {
  return {
    async getSession(): Promise<Session> {
      try {
        return { status: 'signed-in', user: await client.getViewer() };
      } catch (error) {
        if (error instanceof AppError && error.code === 'gh-not-installed') {
          return { status: 'gh-not-installed' };
        }
        if (
          error instanceof AppError &&
          (error.code === 'gh-not-authenticated' || error.code === 'github-unauthorized')
        ) {
          return { status: 'signed-out' };
        }
        throw error;
      }
    },

    async listInbox() {
      const [reviewRequested, authored] = await Promise.all([
        client.searchPullRequests(INBOX_QUERIES.reviewRequested, INBOX_LIMIT),
        client.searchPullRequests(INBOX_QUERIES.authored, INBOX_LIMIT),
      ]);
      return { reviewRequested, authored };
    },

    getPullRequest(ref) {
      return client.getPullRequest(ref);
    },
  };
}
