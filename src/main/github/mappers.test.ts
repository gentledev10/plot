import { describe, expect, it } from 'vitest';
import { pullRequest, searchItem } from './fixtures';
import {
  repositoryFromApiUrl,
  toGitHubUser,
  toPullRequestDetail,
  toPullRequestSummaryFromSearch,
} from './mappers';

const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

describe('toPullRequestSummaryFromSearch', () => {
  it('maps a search result to a summary', () => {
    expect(toPullRequestSummaryFromSearch(searchItem(), 'github.com')).toEqual({
      ref,
      title: 'Add dark mode',
      author: {
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
      },
      isDraft: false,
      state: 'open',
      updatedAt: '2026-10-30T10:00:00Z',
      url: 'https://github.com/octocat/hello-world/pull/42',
    });
  });

  it('tells merged pull requests from ones closed without merging', () => {
    const merged = searchItem({
      state: 'closed',
      pull_request: { merged_at: '2026-10-30T11:00:00Z' },
    });
    expect(toPullRequestSummaryFromSearch(merged, 'github.com').state).toBe('merged');
    const closed = searchItem({ state: 'closed', pull_request: { merged_at: null } });
    expect(toPullRequestSummaryFromSearch(closed, 'github.com').state).toBe('closed');
  });

  it('treats a missing draft flag as not draft', () => {
    const { draft: _omitted, ...item } = searchItem();
    expect(toPullRequestSummaryFromSearch(item, 'github.com').isDraft).toBe(false);
    expect(toPullRequestSummaryFromSearch(searchItem({ draft: true }), 'github.com').isDraft).toBe(
      true,
    );
  });

  it('fails with a clear error when GitHub changes the shape', () => {
    expect(() =>
      toPullRequestSummaryFromSearch(searchItem({ number: '42' }), 'github.com'),
    ).toThrow('GitHub returned an unexpected number.');
    expect(() => toPullRequestSummaryFromSearch(searchItem({ user: null }), 'github.com')).toThrow(
      /user/,
    );
  });
});

describe('toPullRequestDetail', () => {
  it('maps an open pull request', () => {
    const detail = toPullRequestDetail(pullRequest(), ref);
    expect(detail).toMatchObject({
      ref,
      state: 'open',
      body: 'Adds a dark theme.',
      nodeId: 'PR_kwDOAAAAAA42',
      base: { ref: 'main', sha: 'a'.repeat(40) },
      head: { ref: 'dark-mode', sha: 'b'.repeat(40) },
      additions: 120,
      deletions: 8,
      changedFiles: 6,
    });
  });

  it('distinguishes merged from merely closed', () => {
    expect(
      toPullRequestDetail(pullRequest({ state: 'closed', merged_at: '2026-10-30T11:00:00Z' }), ref)
        .state,
    ).toBe('merged');
    expect(toPullRequestDetail(pullRequest({ state: 'closed' }), ref).state).toBe('closed');
  });

  it('uses an empty body when the description is empty', () => {
    expect(toPullRequestDetail(pullRequest({ body: null }), ref).body).toBe('');
  });
});

describe('repositoryFromApiUrl', () => {
  it('extracts owner and repository', () => {
    expect(repositoryFromApiUrl('https://api.github.com/repos/octocat/hello-world')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('rejects other URLs', () => {
    expect(() => repositoryFromApiUrl('https://api.github.com/users/octocat')).toThrow();
  });
});

describe('toGitHubUser', () => {
  it('maps login and avatar', () => {
    expect(toGitHubUser({ login: 'octocat', avatar_url: 'https://example.test/a.png' })).toEqual({
      login: 'octocat',
      avatarUrl: 'https://example.test/a.png',
    });
  });
});
