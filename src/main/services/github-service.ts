import type {
  PullRequestScope,
  PullRequestStateFilter,
  RepositoryPullRequestQuery,
} from '@shared/github';
import type { PlotApi } from '@shared/ipc';
import type { GitHubConnections } from '../github/connections';

export const INBOX_QUERIES = {
  reviewRequested: 'is:pr is:open archived:false review-requested:@me',
  authored: 'is:pr is:open archived:false author:@me',
} as const;

const INBOX_LIMIT = 50;

const REPOSITORY_CHOICES = 100;

export const REPOSITORY_PAGE_SIZE = 30;

const STATE_QUALIFIERS: Record<PullRequestStateFilter, string> = {
  open: 'is:open',
  merged: 'is:merged',
  closed: 'is:closed is:unmerged',
  all: '',
};

const SCOPE_QUALIFIERS: Record<PullRequestScope, string> = {
  everyone: '',
  'review-requested': 'review-requested:@me',
  authored: 'author:@me',
  assigned: 'assignee:@me',
};

export function repositorySearch({
  repository,
  state,
  scope,
  text,
}: RepositoryPullRequestQuery): string {
  return [
    `repo:${repository.owner}/${repository.repo}`,
    'is:pr',
    STATE_QUALIFIERS[state],
    SCOPE_QUALIFIERS[scope],
    text.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

export type GitHubService = Pick<
  PlotApi,
  | 'listInbox'
  | 'getPullRequest'
  | 'listAccessibleRepositories'
  | 'findRepository'
  | 'countOpenPullRequests'
  | 'listRepositoryPullRequests'
>;

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

    async listAccessibleRepositories() {
      const { client } = await connections.current();
      return client.listRepositories(REPOSITORY_CHOICES);
    },

    async findRepository(ref) {
      const { client } = await connections.forHost(ref.host);
      return client.getRepository(ref);
    },

    async countOpenPullRequests(ref) {
      const { client } = await connections.forHost(ref.host);
      return client.countOpenPullRequests(ref);
    },

    async listRepositoryPullRequests(query) {
      const { client } = await connections.forHost(query.repository.host);
      return client.searchPullRequestPage(
        repositorySearch(query),
        query.page,
        REPOSITORY_PAGE_SIZE,
      );
    },
  };
}
