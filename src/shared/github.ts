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

export interface PullRequestSummary {
  ref: PullRequestRef;
  title: string;
  author: GitHubUser;
  isDraft: boolean;
  updatedAt: string;
  url: string;
}

export type PullRequestState = 'open' | 'closed' | 'merged';

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  state: PullRequestState;
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

export interface RepositoryPullRequestQuery {
  repository: RepositoryRef;
  page: number;
}

export interface Inbox {
  reviewRequested: PullRequestSummary[];
  authored: PullRequestSummary[];
}
