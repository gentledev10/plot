export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface PullRequestRef {
  host: string;
  owner: string;
  repo: string;
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

export interface Inbox {
  reviewRequested: PullRequestSummary[];
  authored: PullRequestSummary[];
}
