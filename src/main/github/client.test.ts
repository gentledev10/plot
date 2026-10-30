import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, type Fetch } from './client';
import { octocat, pullRequest, searchItem } from './fixtures';
import type { TokenProvider } from './token';

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function setup(...responses: Array<Response | Error>) {
  const fetch = vi.fn<Fetch>();
  for (const response of responses) {
    if (response instanceof Error) {
      fetch.mockRejectedValueOnce(response);
    } else {
      fetch.mockResolvedValueOnce(response);
    }
  }
  const tokens = {
    getToken: vi.fn<TokenProvider['getToken']>().mockResolvedValue('gho_token'),
    invalidate: vi.fn<TokenProvider['invalidate']>(),
  };
  const client = createGitHubClient({
    fetch,
    tokens,
    userAgent: 'Viewer/test',
    apiUrl: 'https://api.test',
  });
  return { client, fetch, tokens };
}

const ref = { owner: 'octocat', repo: 'hello-world', number: 42 };

describe('createGitHubClient', () => {
  it('sends the token and GitHub API headers', async () => {
    const { client, fetch } = setup(json(octocat));
    await client.getViewer();

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/user');
    expect(init?.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer gho_token',
      'User-Agent': 'Viewer/test',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('returns the signed-in user', async () => {
    const { client } = setup(json(octocat));
    await expect(client.getViewer()).resolves.toEqual({
      login: 'octocat',
      avatarUrl: octocat.avatar_url,
    });
  });

  it('searches pull requests sorted by last update', async () => {
    const { client, fetch } = setup(json({ items: [searchItem(), searchItem({ number: 7 })] }));
    const results = await client.searchPullRequests('is:pr review-requested:@me', 25);

    expect(results.map((pull) => pull.ref.number)).toEqual([42, 7]);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe('/search/issues');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'is:pr review-requested:@me',
      sort: 'updated',
      order: 'desc',
      per_page: '25',
    });
  });

  it('loads a pull request by reference', async () => {
    const { client, fetch } = setup(json(pullRequest()));
    const detail = await client.getPullRequest(ref);

    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/repos/octocat/hello-world/pulls/42');
    expect(detail.ref).toEqual(ref);
    expect(detail.head.sha).toBe('b'.repeat(40));
  });

  it('refreshes the token once when GitHub returns 401', async () => {
    const { client, fetch, tokens } = setup(new Response(null, { status: 401 }), json(octocat));
    await expect(client.getViewer()).resolves.toMatchObject({ login: 'octocat' });
    expect(tokens.invalidate).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up when the refreshed token is rejected too', async () => {
    const { client, fetch } = setup(
      new Response(null, { status: 401 }),
      new Response(null, { status: 401 }),
    );
    await expect(client.getViewer()).rejects.toMatchObject({ code: 'github-unauthorized' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports rate limits with the reset time', async () => {
    const { client } = setup(
      json(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1793350800' },
        },
      ),
    );
    await expect(client.getViewer()).rejects.toMatchObject({
      code: 'github-rate-limited',
      message: expect.stringContaining('Try again after'),
    });
  });

  it('points to the authorization page when the organization requires SSO', async () => {
    const { client } = setup(
      json(
        { message: 'Resource protected by organization SAML enforcement.' },
        {
          status: 403,
          headers: { 'x-github-sso': 'required; url=https://github.com/orgs/acme/sso?authz=1' },
        },
      ),
    );
    await expect(client.getPullRequest(ref)).rejects.toMatchObject({
      code: 'github-sso-required',
      message: expect.stringContaining('https://github.com/orgs/acme/sso?authz=1'),
    });
  });

  it('reports missing or inaccessible pull requests', async () => {
    const { client } = setup(json({ message: 'Not Found' }, { status: 404 }));
    await expect(client.getPullRequest(ref)).rejects.toMatchObject({ code: 'github-not-found' });
  });

  it('includes the GitHub message for other failures', async () => {
    const { client } = setup(json({ message: 'Validation Failed' }, { status: 422 }));
    await expect(client.searchPullRequests('bad', 10)).rejects.toMatchObject({
      code: 'github-request-failed',
      message: 'GitHub returned 422: Validation Failed',
    });
  });

  it('reports network failures', async () => {
    const { client } = setup(new TypeError('fetch failed'));
    await expect(client.getViewer()).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects malformed search responses', async () => {
    const { client } = setup(json({ total_count: 0 }));
    await expect(client.searchPullRequests('is:pr', 10)).rejects.toMatchObject({
      code: 'github-request-failed',
    });
  });
});
