import { describe, expect, it } from 'vitest';
import {
  formatPullRequestRef,
  isPullRequestRef,
  isSamePullRequest,
  parsePullRequestRef,
  pullRequestUrl,
} from './pull-request-ref';

describe('parsePullRequestRef', () => {
  it('parses pull request URLs', () => {
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('ignores tabs, queries, fragments, and surrounding whitespace', () => {
    const expected = { owner: 'octocat', repo: 'hello-world', number: 42 };
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42/files')).toEqual(
      expected,
    );
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/42?w=1')).toEqual(
      expected,
    );
    expect(
      parsePullRequestRef('https://github.com/octocat/hello-world/pull/42#discussion_r1'),
    ).toEqual(expected);
    expect(parsePullRequestRef('  https://github.com/octocat/hello-world/pull/42\n')).toEqual(
      expected,
    );
  });

  it('parses owner/repo#number shorthand', () => {
    expect(parsePullRequestRef('octocat/hello-world#7')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      number: 7,
    });
  });

  it('accepts names with dots, underscores, and managed-user suffixes', () => {
    expect(parsePullRequestRef('https://github.com/my_org-emu/my.repo_name/pull/1')).toEqual({
      owner: 'my_org-emu',
      repo: 'my.repo_name',
      number: 1,
    });
  });

  it('rejects anything that is not a github.com pull request', () => {
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/issues/42')).toBeUndefined();
    expect(parsePullRequestRef('https://gitlab.com/octocat/hello-world/pull/42')).toBeUndefined();
    expect(parsePullRequestRef('http://github.com/octocat/hello-world/pull/42')).toBeUndefined();
    expect(parsePullRequestRef('https://github.com/octocat/hello-world/pull/0')).toBeUndefined();
    expect(parsePullRequestRef('https://github.com/octocat/../pull/1')).toBeUndefined();
    expect(parsePullRequestRef('octocat/hello-world')).toBeUndefined();
    expect(parsePullRequestRef('')).toBeUndefined();
  });
});

describe('isPullRequestRef', () => {
  it('accepts well-formed refs', () => {
    expect(isPullRequestRef({ owner: 'octocat', repo: 'hello-world', number: 1 })).toBe(true);
  });

  it('rejects values that could smuggle paths or bad numbers', () => {
    expect(isPullRequestRef(null)).toBe(false);
    expect(isPullRequestRef('octocat/hello-world#1')).toBe(false);
    expect(isPullRequestRef({ owner: 'octocat', repo: '..', number: 1 })).toBe(false);
    expect(isPullRequestRef({ owner: 'octo/cat', repo: 'hello', number: 1 })).toBe(false);
    expect(isPullRequestRef({ owner: '-octocat', repo: 'hello', number: 1 })).toBe(false);
    expect(isPullRequestRef({ owner: 'octocat', repo: 'hello', number: 1.5 })).toBe(false);
    expect(isPullRequestRef({ owner: 'octocat', repo: 'hello', number: -1 })).toBe(false);
    expect(isPullRequestRef({ owner: 'octocat', repo: 'hello', number: '1' })).toBe(false);
  });
});

describe('formatting', () => {
  const ref = { owner: 'octocat', repo: 'hello-world', number: 42 };

  it('formats the shorthand and the web URL', () => {
    expect(formatPullRequestRef(ref)).toBe('octocat/hello-world#42');
    expect(pullRequestUrl(ref)).toBe('https://github.com/octocat/hello-world/pull/42');
  });

  it('round-trips through the parser', () => {
    expect(parsePullRequestRef(formatPullRequestRef(ref))).toEqual(ref);
    expect(parsePullRequestRef(pullRequestUrl(ref))).toEqual(ref);
  });
});

describe('isSamePullRequest', () => {
  it('compares owner and repo without case sensitivity, like GitHub does', () => {
    expect(
      isSamePullRequest(
        { owner: 'Octocat', repo: 'Hello-World', number: 1 },
        { owner: 'octocat', repo: 'hello-world', number: 1 },
      ),
    ).toBe(true);
  });

  it('treats different numbers and missing refs as different', () => {
    const ref = { owner: 'octocat', repo: 'hello-world', number: 1 };
    expect(isSamePullRequest(ref, { ...ref, number: 2 })).toBe(false);
    expect(isSamePullRequest(ref, undefined)).toBe(false);
    expect(isSamePullRequest(undefined, undefined)).toBe(false);
  });
});
