export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface RepositoryRef {
  host: string;
  owner: string;
  repo: string;
}

export interface PullRequestRef extends RepositoryRef {
  number: number;
}

export type PullRequestState = 'open' | 'closed' | 'merged';

export interface PullRequestSummary {
  ref: PullRequestRef;
  title: string;
  author: GitHubUser;
  isDraft: boolean;
  state: PullRequestState;
  updatedAt: string;
  url: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  nodeId: string;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface PullRequestPage {
  pullRequests: PullRequestSummary[];
  total: number;
}

export const PULL_REQUEST_STATE_FILTERS = ['open', 'merged', 'closed', 'all'] as const;

export type PullRequestStateFilter = (typeof PULL_REQUEST_STATE_FILTERS)[number];

export const PULL_REQUEST_SCOPES = [
  'everyone',
  'review-requested',
  'authored',
  'assigned',
] as const;

export type PullRequestScope = (typeof PULL_REQUEST_SCOPES)[number];

export interface RepositoryPullRequestQuery {
  repository: RepositoryRef;
  state: PullRequestStateFilter;
  scope: PullRequestScope;
  text: string;
  page: number;
}

export interface Inbox {
  reviewRequested: PullRequestSummary[];
  authored: PullRequestSummary[];
}
