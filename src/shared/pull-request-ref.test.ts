import { describe, expect, it } from 'vitest';
import {
  formatPullRequestRef,
  isPullRequestRef,
  isSamePullRequest,
  parsePullRequestRef,
  pullRequestKey,
  pullRequestUrl,
} from './pull-request-ref';

const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

describe('parsePullRequestRef', () => {
  it('parses pull request URLs', () => {
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42')).toEqual(ref);
  });

  it('ignores tabs, queries, fragments, and surrounding whitespace', () => {
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42/files')).toEqual(
      ref,
    );
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42?w=1')).toEqual(ref);
    expect(
      parsePullRequestRef('https://github.com/octocat/hello-world/pull/42#discussion_r1'),
    ).toEqual(ref);
    expect(parsePullRequestRef('  https://github.com/octocat/hello-world/pull/42\n')).toEqual(ref);
  });

  it('reads the host from GitHub Enterprise URLs', () => {
    expect(parsePullRequestRef('https://github.example.com/platform/api/pull/7')).toEqual({
      host: 'github.example.com',
      owner: 'platform',
      repo: 'api',
      number: 7,
    });
    expect(parsePullRequestRef('https://octo.ghe.com/platform/api/pull/7')?.host).toBe(
      'octo.ghe.com',
    );
  });

  it('parses owner/repo#number shorthand on the default host', () => {
    expect(parsePullRequestRef('octocat/hello-world#42')).toEqual(ref);
    expect(parsePullRequestRef('platform/api#7', 'github.example.com')).toEqual({
      host: 'github.example.com',
      owner: 'platform',
      repo: 'api',
      number: 7,
    });
  });

  it('accepts names with dots, underscores, and managed-user suffixes', () => {
    expect(parsePullRequestRef('https://github.com/my_org-emu/my.repo_name/pull/1')).toEqual({
      host: 'github.com',
      owner: 'my_org-emu',
      repo: 'my.repo_name',
      number: 1,
    });
  });

  it('rejects anything that is not a pull request', () => {
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/issues/42')).toBeUndefined();
    expect(parsePullRequestRef('http://github.com/octocat/hello-world/pull/42')).toBeUndefined();
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/0')).toBeUndefined();
    expect(parsePullRequestRef('https://github.com/octocat/../pull/1')).toBeUndefined();
    expect(parsePullRequestRef('https://localhost/octocat/hello-world/pull/1')).toBeUndefined();
    expect(parsePullRequestRef('https://user@github.com/octocat/repo/pull/1')).toBeUndefined();
    expect(parsePullRequestRef('octocat/hello-world')).toBeUndefined();
    expect(parsePullRequestRef('')).toBeUndefined();
  });
});

describe('isPullRequestRef', () => {
  it('accepts well-formed refs', () => {
    expect(isPullRequestRef(ref)).toBe(true);
  });

  it('rejects values that could smuggle paths or bad numbers', () => {
    expect(isPullRequestRef(null)).toBe(false);
    expect(isPullRequestRef('octocat/hello-world#1')).toBe(false);
    expect(isPullRequestRef({ ...ref, host: '../github.com' })).toBe(false);
    expect(isPullRequestRef({ ...ref, host: undefined })).toBe(false);
    expect(isPullRequestRef({ ...ref, repo: '..' })).toBe(false);
    expect(isPullRequestRef({ ...ref, owner: 'octo/cat' })).toBe(false);
    expect(isPullRequestRef({ ...ref, owner: '-octocat' })).toBe(false);
    expect(isPullRequestRef({ ...ref, number: 1.5 })).toBe(false);
    expect(isPullRequestRef({ ...ref, number: -1 })).toBe(false);
    expect(isPullRequestRef({ ...ref, number: '1' })).toBe(false);
  });
});

describe('formatting', () => {
  const enterprise = { ...ref, host: 'github.example.com' };

  it('formats the shorthand and the web URL', () => {
    expect(formatPullRequestRef(ref)).toBe('octocat/hello-world#42');
    expect(pullRequestUrl(ref)).toBe('https://github.com/octocat/hello-world/pull/42');
  });

  it('names the host when it is not github.com', () => {
    expect(formatPullRequestRef(enterprise)).toBe('github.example.com/octocat/hello-world#42');
    expect(pullRequestUrl(enterprise)).toBe(
      'https://github.example.com/octocat/hello-world/pull/42',
    );
  });

  it('round-trips through the parser', () => {
    expect(parsePullRequestRef(formatPullRequestRef(ref))).toEqual(ref);
    expect(parsePullRequestRef(pullRequestUrl(ref))).toEqual(ref);
    expect(parsePullRequestRef(pullRequestUrl(enterprise))).toEqual(enterprise);
  });
});

describe('isSamePullRequest', () => {
  it('compares owner and repo without case sensitivity, like GitHub does', () => {
    expect(isSamePullRequest({ ...ref, owner: 'Octocat', repo: 'Hello-World' }, ref)).toBe(true);
    expect(pullRequestKey({ ...ref, owner: 'Octocat' })).toBe(pullRequestKey(ref));
  });

  it('treats different hosts, numbers, and missing refs as different', () => {
    expect(isSamePullRequest(ref, { ...ref, host: 'github.example.com' })).toBe(false);
    expect(isSamePullRequest(ref, { ...ref, number: 2 })).toBe(false);
    expect(isSamePullRequest(ref, undefined)).toBe(false);
    expect(isSamePullRequest(undefined, undefined)).toBe(false);
  });
});
