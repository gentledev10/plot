import type { PullRequestRef } from './github';
import { GITHUB_HOST, isHost, normalizeHost } from './hosts';

const OWNER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const PULL_URL = /^https:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const SHORTHAND = /^([^/\s]+)\/([^/\s#]+)#(\d+)$/;

export function isPullRequestRef(value: unknown): value is PullRequestRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { host, owner, repo, number } = value as Record<string, unknown>;
  return (
    isHost(host) &&
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

export function parsePullRequestRef(
  input: string,
  defaultHost = GITHUB_HOST,
): PullRequestRef | undefined {
  const text = input.trim();
  const url = PULL_URL.exec(text);
  if (url) {
    const [, host = '', owner, repo, number] = url;
    return toRef(normalizeHost(host), owner, repo, number);
  }
  const shorthand = SHORTHAND.exec(text);
  if (shorthand) {
    const [, owner, repo, number] = shorthand;
    return toRef(defaultHost, owner, repo, number);
  }
  return undefined;
}

function toRef(
  host: string | undefined,
  owner: string | undefined,
  repo: string | undefined,
  number: string | undefined,
): PullRequestRef | undefined {
  const ref = { host, owner, repo: repo?.replace(/\.git$/, ''), number: Number(number) };
  return isPullRequestRef(ref) ? ref : undefined;
}

export function formatPullRequestRef({ host, owner, repo, number }: PullRequestRef): string {
  const name = `${owner}/${repo}#${number}`;
  return host === GITHUB_HOST ? name : `${host}/${name}`;
}

export function pullRequestKey({ host, owner, repo, number }: PullRequestRef): string {
  return `${host}/${owner}/${repo}#${number}`.toLowerCase();
}

export function pullRequestUrl({ host, owner, repo, number }: PullRequestRef): string {
  return `https://${host}/${owner}/${repo}/pull/${number}`;
}

export function isSamePullRequest(
  a: PullRequestRef | undefined,
  b: PullRequestRef | undefined,
): boolean {
  return a !== undefined && b !== undefined && pullRequestKey(a) === pullRequestKey(b);
}
