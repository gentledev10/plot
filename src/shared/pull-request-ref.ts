import type { PullRequestRef } from './github';
import { GITHUB_HOST, normalizeHost } from './hosts';
import { formatRepositoryRef, isRepositoryRef, repositoryKey } from './repository-ref';

const PULL_URL = /^https:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const SHORTHAND = /^([^/\s]+)\/([^/\s#]+)#(\d+)$/;

export function isPullRequestRef(value: unknown): value is PullRequestRef {
  if (!isRepositoryRef(value)) {
    return false;
  }
  const { number } = value as { number?: unknown };
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0;
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

export function formatPullRequestRef(ref: PullRequestRef): string {
  return `${formatRepositoryRef(ref)}#${ref.number}`;
}

export function pullRequestKey(ref: PullRequestRef): string {
  return `${repositoryKey(ref)}#${ref.number}`;
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
