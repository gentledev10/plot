import type { PullRequestSummary } from '@shared/github';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../github/client';
import { fakeConnections } from '../github/fake-connections';
import { createGitHubService, INBOX_QUERIES, REPOSITORY_PAGE_SIZE } from './github-service';

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
    searchPullRequestPage: vi.fn().mockResolvedValue({ pullRequests: [], total: 0 }),
    getPullRequest: vi.fn(),
    getMergeBase: vi.fn(),
    listRepositories: vi.fn().mockResolvedValue([]),
    getRepository: vi.fn(),
    countOpenPullRequests: vi.fn().mockResolvedValue(0),
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

describe('repositories', () => {
  const api = { host: 'github.com', owner: 'acme', repo: 'api' };

  it('suggests the repositories the current account can reach', async () => {
    const listRepositories = vi.fn().mockResolvedValue([api]);
    const service = createGitHubService(fakeConnections(fakeClient({ listRepositories })));

    await expect(service.listAccessibleRepositories()).resolves.toEqual([api]);
    expect(listRepositories).toHaveBeenCalledWith(100);
  });

  it('asks the account for the repository host', async () => {
    const getRepository = vi.fn().mockResolvedValue(api);
    const countOpenPullRequests = vi.fn().mockResolvedValue(12);
    const service = createGitHubService(
      fakeConnections(fakeClient({ getRepository, countOpenPullRequests })),
    );

    await expect(service.findRepository({ ...api, owner: 'ACME' })).resolves.toEqual(api);
    await expect(service.countOpenPullRequests(api)).resolves.toBe(12);
    await expect(
      service.countOpenPullRequests({ ...api, host: 'github.example.com' }),
    ).rejects.toMatchObject({ code: 'github-no-account' });
  });

  it('lists the open pull requests of a repository one page at a time', async () => {
    const searchPullRequestPage = vi
      .fn()
      .mockResolvedValue({ pullRequests: [summary(4)], total: 31 });
    const service = createGitHubService(fakeConnections(fakeClient({ searchPullRequestPage })));

    await expect(service.listRepositoryPullRequests({ repository: api, page: 2 })).resolves.toEqual(
      { pullRequests: [summary(4)], total: 31 },
    );
    expect(searchPullRequestPage).toHaveBeenCalledWith(
      'repo:acme/api is:pr is:open',
      2,
      REPOSITORY_PAGE_SIZE,
    );
  });
});
