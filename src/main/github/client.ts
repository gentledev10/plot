import type {
  GitHubUser,
  PullRequestDetail,
  PullRequestRef,
  PullRequestSummary,
} from '@shared/github';
import { AppError } from '../errors';
import {
  toGitHubUser,
  toMergeBase,
  toPullRequestDetail,
  toPullRequestSummaryFromSearch,
} from './mappers';
import type { TokenProvider } from './token';

export interface GitHubClient {
  getViewer(): Promise<GitHubUser>;
  searchPullRequests(query: string, limit: number): Promise<PullRequestSummary[]>;
  getPullRequest(ref: PullRequestRef): Promise<PullRequestDetail>;
  getMergeBase(ref: PullRequestRef, base: string, head: string): Promise<string>;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
  fetch: Fetch;
  tokens: TokenProvider;
  userAgent: string;
  apiUrl?: string;
}

export function createGitHubClient({
  fetch,
  tokens,
  userAgent,
  apiUrl = 'https://api.github.com',
}: GitHubClientOptions): GitHubClient {
  async function request(path: string, isRetry = false): Promise<unknown> {
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
      throw new AppError('network', 'Could not reach GitHub. Check your connection.', {
        cause: error,
      });
    }
    if (response.status === 401 && !isRetry) {
      tokens.invalidate();
      return request(path, true);
    }
    if (!response.ok) {
      throw await toAppError(response);
    }
    return response.json();
  }

  return {
    async getViewer() {
      return toGitHubUser(await request('/user'));
    },

    async searchPullRequests(query, limit) {
      const params = new URLSearchParams({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: String(limit),
      });
      const result = (await request(`/search/issues?${params}`)) as { items?: unknown };
      if (!Array.isArray(result.items)) {
        throw new AppError('github-request-failed', 'GitHub returned an unexpected search result.');
      }
      return result.items.map(toPullRequestSummaryFromSearch);
    },

    async getPullRequest(ref) {
      return toPullRequestDetail(await request(`${repositoryPath(ref)}/pulls/${ref.number}`), ref);
    },

    async getMergeBase(ref, base, head) {
      return toMergeBase(
        await request(`${repositoryPath(ref)}/compare/${base}...${head}?per_page=1`),
      );
    },
  };
}

function repositoryPath({ owner, repo }: PullRequestRef): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function toAppError(response: Response): Promise<AppError> {
  const sso = response.headers.get('x-github-sso');
  if (sso) {
    const url = /url=(\S+)/.exec(sso)?.[1];
    return new AppError(
      'github-sso-required',
      url
        ? `Your organization requires single sign-on for this token. Authorize it at ${url}`
        : 'Your organization requires single sign-on. Run `gh auth refresh` and authorize the organization.',
    );
  }
  if (response.status === 401) {
    return new AppError(
      'github-unauthorized',
      'GitHub rejected the token from the GitHub CLI. Run `gh auth login` again.',
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
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {}
  return response.statusText || 'Unknown error';
}
