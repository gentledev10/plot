import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, type Fetch, lastPage } from './client';
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
    userAgent: 'Plot/test',
    host: 'github.com',
    apiUrl: 'https://api.test',
  });
  return { client, fetch, tokens };
}

const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

describe('createGitHubClient', () => {
  it('sends the token and GitHub API headers', async () => {
    const { client, fetch } = setup(json(octocat));
    await client.getViewer();

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/user');
    expect(init?.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer gho_token',
      'User-Agent': 'Plot/test',
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
    const { client, fetch } = setup(
      json({ total_count: 2, items: [searchItem(), searchItem({ number: 7 })] }),
    );
    const results = await client.searchPullRequests('is:pr review-requested:@me', 25);

    expect(results.map((pull) => pull.ref.number)).toEqual([42, 7]);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe('/search/issues');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'is:pr review-requested:@me',
      sort: 'updated',
      order: 'desc',
      per_page: '25',
      page: '1',
    });
  });

  it('reads one page of search results with the total', async () => {
    const { client, fetch } = setup(json({ total_count: 61, items: [searchItem()] }));

    const page = await client.searchPullRequestPage('repo:octocat/hello-world is:pr', 3, 30);

    expect(page.total).toBe(61);
    expect(page.pullRequests.map((pull) => pull.ref.number)).toEqual([42]);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('per_page')).toBe('30');
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
    expect(tokens.invalidate).toHaveBeenCalledWith('gho_token');
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

  it('prefers the reason GitHub gives for a rejected request', async () => {
    const reason =
      'The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them.';
    const { client } = setup(
      json({ message: 'Validation Failed', errors: [{ message: reason }] }, { status: 422 }),
    );
    await expect(client.searchPullRequests('repo:old/name', 10)).rejects.toMatchObject({
      message: `GitHub returned 422: ${reason}`,
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

describe('getMergeBase', () => {
  it('asks GitHub where the pull request branched off', async () => {
    const { client, fetch } = setup(json({ merge_base_commit: { sha: 'c'.repeat(40) } }));

    await expect(client.getMergeBase(ref, 'a'.repeat(40), 'b'.repeat(40))).resolves.toBe(
      'c'.repeat(40),
    );
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe(
      `/repos/octocat/hello-world/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
    );
  });

  it('rejects comparisons without a merge base', async () => {
    const { client } = setup(json({ status: 'diverged' }));
    await expect(client.getMergeBase(ref, 'a'.repeat(40), 'b'.repeat(40))).rejects.toMatchObject({
      code: 'github-request-failed',
    });
  });
});

describe('repositories', () => {
  const repository = (owner: string, name: string) => ({ name, owner: { login: owner } });
  const api = { host: 'github.com', owner: 'acme', repo: 'api' };

  it('lists the repositories the account works on, most recently pushed first', async () => {
    const { client, fetch } = setup(
      json([repository('acme', 'api'), repository('octocat', 'web')]),
    );

    await expect(client.listRepositories(100)).resolves.toEqual([
      api,
      { host: 'github.com', owner: 'octocat', repo: 'web' },
    ]);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe('/user/repos');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sort: 'pushed',
      per_page: '100',
      affiliation: 'owner,collaborator,organization_member',
    });
  });

  it('returns the name GitHub uses for a repository', async () => {
    const { client, fetch } = setup(json(repository('acme', 'api')));

    await expect(client.getRepository({ ...api, owner: 'ACME', repo: 'API' })).resolves.toEqual(
      api,
    );
    expect(new URL(fetch.mock.calls[0]?.[0] ?? '').pathname).toBe('/repos/ACME/API');
  });

  it('counts open pull requests from the last page number', async () => {
    const link =
      '<https://api.test/repositories/1/pulls?state=open&per_page=1&page=2>; rel="next", ' +
      '<https://api.test/repositories/1/pulls?state=open&per_page=1&page=12>; rel="last"';
    const { client, fetch } = setup(json([pullRequest()], { headers: { link } }));

    await expect(client.countOpenPullRequests(api)).resolves.toBe(12);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe('/repos/acme/api/pulls');
    expect(Object.fromEntries(url.searchParams)).toEqual({ state: 'open', per_page: '1' });
  });

  it('counts the pull requests on the only page when there is no Link header', async () => {
    await expect(setup(json([pullRequest()])).client.countOpenPullRequests(api)).resolves.toBe(1);
    await expect(setup(json([])).client.countOpenPullRequests(api)).resolves.toBe(0);
  });
});

describe('lastPage', () => {
  it('finds the last page in a Link header', () => {
    expect(lastPage('<https://x/y?page=7&per_page=1>; rel="last"')).toBe(7);
    expect(lastPage('<https://x/y?page=2>; rel="next"')).toBeUndefined();
    expect(lastPage(null)).toBeUndefined();
  });
});

describe('findOpenPullRequest', () => {
  const base = { host: 'github.com', owner: 'octocat', repo: 'hello-world' };

  it('finds the open pull request of a branch', async () => {
    const { client, fetch } = setup(json([pullRequest()]));

    await expect(client.findOpenPullRequest(base, 'octocat:dark-mode')).resolves.toMatchObject({
      ref: { ...base, number: 42 },
      title: 'Add dark mode',
      state: 'open',
    });
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe('/repos/octocat/hello-world/pulls');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state: 'open',
      head: 'octocat:dark-mode',
      per_page: '1',
    });
  });

  it('returns nothing when the branch has no open pull request', async () => {
    await expect(setup(json([])).client.findOpenPullRequest(base, 'octocat:x')).resolves.toBeNull();
  });
});
