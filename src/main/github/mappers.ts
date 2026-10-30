import type {
  GitHubUser,
  PullRequestDetail,
  PullRequestRef,
  PullRequestState,
  PullRequestSummary,
} from '@shared/github';
import { AppError } from '../errors';

type Json = Record<string, unknown>;

export function toGitHubUser(value: unknown): GitHubUser {
  const user = object(value, 'user');
  return { login: string(user.login, 'user.login'), avatarUrl: string(user.avatar_url, 'avatar') };
}

export function toPullRequestSummaryFromSearch(value: unknown): PullRequestSummary {
  const item = object(value, 'search item');
  const { owner, repo } = repositoryFromApiUrl(string(item.repository_url, 'repository_url'));
  return {
    ref: { owner, repo, number: number(item.number, 'number') },
    title: string(item.title, 'title'),
    author: toGitHubUser(item.user),
    isDraft: item.draft === true,
    updatedAt: string(item.updated_at, 'updated_at'),
    url: string(item.html_url, 'html_url'),
  };
}

export function toPullRequestDetail(value: unknown, ref: PullRequestRef): PullRequestDetail {
  const pull = object(value, 'pull request');
  const base = object(pull.base, 'base');
  const head = object(pull.head, 'head');
  return {
    ref,
    title: string(pull.title, 'title'),
    author: toGitHubUser(pull.user),
    isDraft: pull.draft === true,
    updatedAt: string(pull.updated_at, 'updated_at'),
    url: string(pull.html_url, 'html_url'),
    body: typeof pull.body === 'string' ? pull.body : '',
    state: pullRequestState(pull),
    nodeId: string(pull.node_id, 'node_id'),
    base: { ref: string(base.ref, 'base.ref'), sha: string(base.sha, 'base.sha') },
    head: { ref: string(head.ref, 'head.ref'), sha: string(head.sha, 'head.sha') },
    additions: number(pull.additions, 'additions'),
    deletions: number(pull.deletions, 'deletions'),
    changedFiles: number(pull.changed_files, 'changed_files'),
  };
}

export function repositoryFromApiUrl(url: string): { owner: string; repo: string } {
  const match = /\/repos\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match?.[1] || !match[2]) {
    throw unexpected('repository_url');
  }
  return { owner: match[1], repo: match[2] };
}

function pullRequestState(pull: Json): PullRequestState {
  if (pull.merged === true || typeof pull.merged_at === 'string') {
    return 'merged';
  }
  return pull.state === 'closed' ? 'closed' : 'open';
}

function object(value: unknown, field: string): Json {
  if (typeof value !== 'object' || value === null) {
    throw unexpected(field);
  }
  return value as Json;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw unexpected(field);
  }
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw unexpected(field);
  }
  return value;
}

function unexpected(field: string): AppError {
  return new AppError('github-request-failed', `GitHub returned an unexpected ${field}.`);
}
