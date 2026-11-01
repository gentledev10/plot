import type {
  GitHubUser,
  PullRequestDetail,
  PullRequestPage,
  PullRequestRef,
  PullRequestSummary,
  RepositoryRef,
} from '@shared/github';
import { apiBaseUrl } from '@shared/hosts';
import { AppError } from '../errors';
import {
  toGitHubUser,
  toMergeBase,
  toPullRequestDetail,
  toPullRequestSummaryFromList,
  toPullRequestSummaryFromSearch,
  toRepositoryRef,
} from './mappers';
import type { TokenProvider } from './token';

export interface GitHubClient {
  getViewer(): Promise<GitHubUser>;
  searchPullRequests(query: string, limit: number): Promise<PullRequestSummary[]>;
  searchPullRequestPage(query: string, page: number, perPage: number): Promise<PullRequestPage>;
  getPullRequest(ref: PullRequestRef): Promise<PullRequestDetail>;
  getMergeBase(ref: PullRequestRef, base: string, head: string): Promise<string>;
  listRepositories(limit: number): Promise<RepositoryRef[]>;
  getRepository(ref: RepositoryRef): Promise<RepositoryRef>;
  countOpenPullRequests(ref: RepositoryRef): Promise<number>;
  findOpenPullRequest(base: RepositoryRef, head: string): Promise<PullRequestSummary | null>;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
  fetch: Fetch;
  tokens: TokenProvider;
  userAgent: string;
  host: string;
  apiUrl?: string;
}

export function createGitHubClient({
  fetch,
  tokens,
  userAgent,
  host,
  apiUrl = apiBaseUrl(host),
}: GitHubClientOptions): GitHubClient {
  async function send(path: string, isRetry = false): Promise<Response> {
    const token = await tokens.getToken();
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (error) {
      throw new AppError('network', `Could not reach ${host}. Check your connection.`, {
        cause: error,
      });
    }
    if (response.status === 401 && !isRetry) {
      tokens.invalidate(token);
      return send(path, true);
    }
    if (!response.ok) {
      throw await toAppError(response);
    }
    return response;
  }

  async function request(path: string): Promise<unknown> {
    return (await send(path)).json();
  }

  async function searchPullRequestPage(
    query: string,
    page: number,
    perPage: number,
  ): Promise<PullRequestPage> {
    const params = new URLSearchParams({
      q: query,
      sort: 'updated',
      order: 'desc',
      per_page: String(perPage),
      page: String(page),
    });
    const result = (await request(`/search/issues?${params}`)) as {
      items?: unknown;
      total_count?: unknown;
    };
    if (!Array.isArray(result.items) || typeof result.total_count !== 'number') {
      throw new AppError('github-request-failed', 'GitHub returned an unexpected search result.');
    }
    return {
      pullRequests: result.items.map((item) => toPullRequestSummaryFromSearch(item, host)),
      total: result.total_count,
    };
  }

  return {
    async getViewer() {
      return toGitHubUser(await request('/user'));
    },

    async searchPullRequests(query, limit) {
      return (await searchPullRequestPage(query, 1, limit)).pullRequests;
    },

    searchPullRequestPage,

    async getPullRequest(ref) {
      return toPullRequestDetail(await request(`${repositoryPath(ref)}/pulls/${ref.number}`), ref);
    },

    async getMergeBase(ref, base, head) {
      return toMergeBase(
        await request(`${repositoryPath(ref)}/compare/${base}...${head}?per_page=1`),
      );
    },

    async listRepositories(limit) {
      const params = new URLSearchParams({
        sort: 'pushed',
        per_page: String(limit),
        affiliation: 'owner,collaborator,organization_member',
      });
      const repositories = await request(`/user/repos?${params}`);
      if (!Array.isArray(repositories)) {
        throw new AppError(
          'github-request-failed',
          'GitHub returned an unexpected repository list.',
        );
      }
      return repositories.map((repository) => toRepositoryRef(repository, host));
    },

    async getRepository(ref) {
      return toRepositoryRef(await request(repositoryPath(ref)), host);
    },

    // GitHub has no count endpoint. With one pull request per page, the number of the last
    // page in the Link header is the count.
    async countOpenPullRequests(ref) {
      const response = await send(`${repositoryPath(ref)}/pulls?state=open&per_page=1`);
      const last = lastPage(response.headers.get('link'));
      if (last !== undefined) {
        return last;
      }
      const pulls = await response.json();
      return Array.isArray(pulls) ? pulls.length : 0;
    },

    async findOpenPullRequest(base, head) {
      const params = new URLSearchParams({ state: 'open', head, per_page: '1' });
      const pulls = await request(`${repositoryPath(base)}/pulls?${params}`);
      if (!Array.isArray(pulls)) {
        throw new AppError(
          'github-request-failed',
          'GitHub returned an unexpected pull request list.',
        );
      }
      return pulls[0] === undefined ? null : toPullRequestSummaryFromList(pulls[0], host);
    },
  };
}

function repositoryPath({ owner, repo }: RepositoryRef): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function lastPage(link: string | null): number | undefined {
  const match = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link ?? '');
  return match?.[1] ? Number(match[1]) : undefined;
}

async function toAppError(response: Response): Promise<AppError> {
  const sso = response.headers.get('x-github-sso');
  if (sso) {
    const url = /url=(\S+)/.exec(sso)?.[1];
    return new AppError(
      'github-sso-required',
      url
        ? `Your organization requires single sign-on for this token. Authorize it at ${url}`
        : 'Your organization requires single sign-on. Authorize this sign-in for the organization on GitHub, then try again.',
    );
  }
  if (response.status === 401) {
    return new AppError(
      'github-unauthorized',
      'GitHub no longer accepts the sign-in for this account. Sign in again in Settings > Accounts.',
    );
  }
  if (isRateLimited(response)) {
    return new AppError('github-rate-limited', rateLimitMessage(response));
  }
  if (response.status === 404) {
    return new AppError(
      'github-not-found',
      'GitHub could not find it, or your account does not have access.',
    );
  }
  return new AppError(
    'github-request-failed',
    `GitHub returned ${response.status}: ${await readMessage(response)}`,
  );
}

function isRateLimited(response: Response): boolean {
  return (
    (response.status === 403 || response.status === 429) &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))
  );
}

function rateLimitMessage(response: Response): string {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const time = new Date(reset * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `GitHub rate limit reached. Try again after ${time}.`;
  }
  return 'GitHub rate limit reached. Try again in a minute.';
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; errors?: unknown };
    const detail = Array.isArray(body.errors)
      ? body.errors.map((error) => (error as { message?: unknown })?.message).find(isString)
      : undefined;
    if (detail) {
      return detail;
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {}
  return response.statusText || 'Unknown error';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
