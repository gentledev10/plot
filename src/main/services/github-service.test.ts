import type { PullRequestSummary } from '@shared/github';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors';
import type { GitHubClient } from '../github/client';
import { createGitHubService, INBOX_QUERIES } from './github-service';

const user = { login: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/1' };

function summary(number: number): PullRequestSummary {
  return {
    ref: { owner: 'octocat', repo: 'hello-world', number },
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
    ...overrides,
  };
}

describe('getSession', () => {
  it('returns the signed-in user', async () => {
    const service = createGitHubService(fakeClient());
    await expect(service.getSession()).resolves.toEqual({ status: 'signed-in', user });
  });

  it('turns a missing gh into a setup state instead of an error', async () => {
    const service = createGitHubService(
      fakeClient({ getViewer: vi.fn().mockRejectedValue(new AppError('gh-not-installed', '')) }),
    );
    await expect(service.getSession()).resolves.toEqual({ status: 'gh-not-installed' });
  });

  it.each(['gh-not-authenticated', 'github-unauthorized'] as const)(
    'treats %s as signed out',
    async (code) => {
      const service = createGitHubService(
        fakeClient({ getViewer: vi.fn().mockRejectedValue(new AppError(code, '')) }),
      );
      await expect(service.getSession()).resolves.toEqual({ status: 'signed-out' });
    },
  );

  it('lets other failures through so the UI can show them', async () => {
    const service = createGitHubService(
      fakeClient({ getViewer: vi.fn().mockRejectedValue(new AppError('network', 'offline')) }),
    );
    await expect(service.getSession()).rejects.toMatchObject({ code: 'network' });
  });
});

describe('listInbox', () => {
  it('loads review requests and authored pull requests in parallel', async () => {
    const searchPullRequests = vi.fn(async (query: string) =>
      query === INBOX_QUERIES.reviewRequested ? [summary(1), summary(2)] : [summary(3)],
    );
    const service = createGitHubService(fakeClient({ searchPullRequests }));

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
