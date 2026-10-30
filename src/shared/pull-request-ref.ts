import type { PullRequestRef } from './github';

const OWNER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const PULL_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const SHORTHAND = /^([^/\s]+)\/([^/\s#]+)#(\d+)$/;

export function isPullRequestRef(value: unknown): value is PullRequestRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { owner, repo, number } = value as Record<string, unknown>;
  return (
    typeof owner === 'string' &&
    OWNER.test(owner) &&
    typeof repo === 'string' &&
    REPO.test(repo) &&
    repo !== '.' &&
    repo !== '..' &&
    typeof number === 'number' &&
    Number.isSafeInteger(number) &&
    number > 0
  );
}

export function parsePullRequestRef(input: string): PullRequestRef | undefined {
  const text = input.trim();
  const match = PULL_URL.exec(text) ?? SHORTHAND.exec(text);
  if (!match) {
    return undefined;
  }
  const [, owner, repo, number] = match;
  const ref = { owner, repo: repo?.replace(/\.git$/, ''), number: Number(number) };
  return isPullRequestRef(ref) ? ref : undefined;
}

export function formatPullRequestRef({ owner, repo, number }: PullRequestRef): string {
  return `${owner}/${repo}#${number}`;
}

export function pullRequestUrl({ owner, repo, number }: PullRequestRef): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

export function isSamePullRequest(a: PullRequestRef | undefined, b: PullRequestRef | undefined) {
  return (
    a !== undefined &&
    b !== undefined &&
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase() &&
    a.number === b.number
  );
}
