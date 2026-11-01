import type { RepositoryRef } from './github';
import { GITHUB_HOST, isHost, normalizeHost } from './hosts';

const OWNER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const WEB_URL =
  /^https?:\/\/(?:[^@/\s]+@)?([^/:\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s?#]+)(?:[/?#].*)?$/;
const SSH_URL = /^ssh:\/\/(?:[^@/\s]+@)?([^/:\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s]+?)\/?$/;
const SCP_URL = /^[^@/\s]+@([^:/\s]+):([^/\s]+)\/([^/\s]+?)\/?$/;
const PATH = /^(?:([^/\s]+\.[^/\s]+)\/)?([^/\s]+)\/([^/\s?#]+?)\/?$/;

export function isRepositoryRef(value: unknown): value is RepositoryRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { host, owner, repo } = value as Record<string, unknown>;
  return (
    isHost(host) &&
    typeof owner === 'string' &&
    OWNER.test(owner) &&
    typeof repo === 'string' &&
    REPO.test(repo) &&
    repo !== '.' &&
    repo !== '..'
  );
}

export function parseRepositoryRef(
  input: string,
  defaultHost = GITHUB_HOST,
): RepositoryRef | undefined {
  const text = input.trim();
  const url = WEB_URL.exec(text) ?? SSH_URL.exec(text) ?? SCP_URL.exec(text);
  if (url) {
    const [, host = '', owner, repo] = url;
    return toRef(normalizeHost(host), owner, repo);
  }
  const path = PATH.exec(text);
  if (path) {
    const [, host, owner, repo] = path;
    return toRef(host === undefined ? defaultHost : normalizeHost(host), owner, repo);
  }
  return undefined;
}

function toRef(
  host: string | undefined,
  owner: string | undefined,
  repo: string | undefined,
): RepositoryRef | undefined {
  const ref = { host, owner, repo: repo?.replace(/\.git$/, '') };
  return isRepositoryRef(ref) ? { host: ref.host, owner: ref.owner, repo: ref.repo } : undefined;
}

export function formatRepositoryRef({ host, owner, repo }: RepositoryRef): string {
  const name = `${owner}/${repo}`;
  return host === GITHUB_HOST ? name : `${host}/${name}`;
}

export function repositoryKey({ host, owner, repo }: RepositoryRef): string {
  return `${host}/${owner}/${repo}`.toLowerCase();
}

export function isSameRepository(
  a: RepositoryRef | undefined,
  b: RepositoryRef | undefined,
): boolean {
  return a !== undefined && b !== undefined && repositoryKey(a) === repositoryKey(b);
}

export function repositoryUrl({ host, owner, repo }: RepositoryRef): string {
  return `https://${host}/${owner}/${repo}`;
}
