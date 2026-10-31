import type { ViewerApi } from '@shared/ipc';
import type { GitHubConnections } from '../github/connections';

export const INBOX_QUERIES = {
  reviewRequested: 'is:pr is:open archived:false review-requested:@me',
  authored: 'is:pr is:open archived:false author:@me',
} as const;

const INBOX_LIMIT = 50;

export type GitHubService = Pick<ViewerApi, 'listInbox' | 'getPullRequest'>;

export function createGitHubService(connections: GitHubConnections): GitHubService {
  return {
    async listInbox() {
      const { client } = await connections.current();
      const [reviewRequested, authored] = await Promise.all([
        client.searchPullRequests(INBOX_QUERIES.reviewRequested, INBOX_LIMIT),
        client.searchPullRequests(INBOX_QUERIES.authored, INBOX_LIMIT),
      ]);
      return { reviewRequested, authored };
    },

    async getPullRequest(ref) {
      const { client } = await connections.forHost(ref.host);
      return client.getPullRequest(ref);
    },
  };
}
