import type { PullRequestSummary } from '@shared/github';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../github/client';
import { fakeConnections } from '../github/fake-connections';
import { createGitHubService, INBOX_QUERIES } from './github-service';

const user = { login: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/1' };

function summary(number: number): PullRequestSummary {
  return {
    ref: { host: 'github.com', owner: 'octocat', repo: 'hello-world', number },
    title: `Pull request ${number}`,
    author: user,
    isDraft: false,
    updatedAt: '2026-10-30T10:00:00Z',
    url: `https://github.com/octocat/hello-world/pull/${number}`,
  };
}

function fakeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getViewer: vi.fn().mockResolvedValue(user),
    searchPullRequests: vi.fn().mockResolvedValue([]),
    getPullRequest: vi.fn(),
    getMergeBase: vi.fn(),
    ...overrides,
  };
}

describe('listInbox', () => {
  it('loads review requests and authored pull requests in parallel', async () => {
    const searchPullRequests = vi.fn(async (query: string) =>
      query === INBOX_QUERIES.reviewRequested ? [summary(1), summary(2)] : [summary(3)],
    );
    const service = createGitHubService(fakeConnections(fakeClient({ searchPullRequests })));

    const inbox = await service.listInbox();

    expect(inbox.reviewRequested.map((pull) => pull.ref.number)).toEqual([1, 2]);
    expect(inbox.authored.map((pull) => pull.ref.number)).toEqual([3]);
    expect(searchPullRequests).toHaveBeenCalledTimes(2);
  });

  it('only asks for open pull requests in repositories that are not archived', () => {
    for (const query of Object.values(INBOX_QUERIES)) {
      expect(query).toContain('is:pr');
      expect(query).toContain('is:open');
      expect(query).toContain('archived:false');
    }
  });
});

describe('getPullRequest', () => {
  it('asks the account connected for the pull request host', async () => {
    const getPullRequest = vi.fn().mockResolvedValue({ title: 'x' });
    const service = createGitHubService(fakeConnections(fakeClient({ getPullRequest })));
    const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 1 };

    await expect(service.getPullRequest(ref)).resolves.toEqual({ title: 'x' });
    await expect(
      service.getPullRequest({ ...ref, host: 'github.example.com' }),
    ).rejects.toMatchObject({ code: 'github-no-account' });
  });
});
