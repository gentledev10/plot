import type { GitHubUser, PullRequestDetail, PullRequestSummary } from '@shared/github';

export function aUser(login = 'octocat'): GitHubUser {
  return { login, avatarUrl: `https://avatars.githubusercontent.com/u/1?v=4&login=${login}` };
}

export function aPullRequestSummary(
  number: number,
  overrides: Partial<PullRequestSummary> = {},
): PullRequestSummary {
  return {
    ref: { owner: 'octocat', repo: 'hello-world', number },
    title: `Pull request ${number}`,
    author: aUser(),
    isDraft: false,
    updatedAt: new Date().toISOString(),
    url: `https://github.com/octocat/hello-world/pull/${number}`,
    ...overrides,
  };
}

export function aPullRequestDetail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    ...aPullRequestSummary(42, { title: 'Add dark mode' }),
    body: 'Adds a dark theme.',
    state: 'open',
    nodeId: 'PR_kwDOAAAAAA42',
    base: { ref: 'main', sha: 'a'.repeat(40) },
    head: { ref: 'dark-mode', sha: 'b'.repeat(40) },
    additions: 120,
    deletions: 8,
    changedFiles: 6,
    ...overrides,
  };
}
