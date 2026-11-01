import { describe, expect, it } from 'vitest';
import { pullRequestLookups } from './local-pull-request';

const acme = { host: 'github.com', owner: 'acme', repo: 'api' };
const fork = { host: 'github.com', owner: 'me', repo: 'api' };

describe('pullRequestLookups', () => {
  it('looks in the repository a branch is pushed to', () => {
    expect(
      pullRequestLookups({
        branch: 'retry',
        remotes: { origin: 'git@github.com:acme/api.git' },
        upstream: { remote: 'origin', branch: 'retry' },
      }),
    ).toEqual([{ base: acme, head: 'acme:retry' }]);
  });

  it('looks in the forked repository first for a clone of a fork', () => {
    expect(
      pullRequestLookups({
        branch: 'local-name',
        remotes: {
          origin: 'https://github.com/me/api.git',
          upstream: 'https://github.com/acme/api.git',
        },
        upstream: { remote: 'origin', branch: 'retry' },
      }),
    ).toEqual([
      { base: acme, head: 'me:retry' },
      { base: fork, head: 'me:retry' },
    ]);
  });

  it('uses the branch name when the branch tracks nothing yet', () => {
    expect(
      pullRequestLookups({
        branch: 'retry',
        remotes: { origin: 'git@github.com:acme/api.git' },
        upstream: null,
      }),
    ).toEqual([{ base: acme, head: 'acme:retry' }]);
  });

  it('gives up without a branch, a GitHub remote, or with remotes on another host', () => {
    const remotes = { origin: 'git@github.com:acme/api.git' };
    expect(pullRequestLookups({ branch: null, remotes, upstream: null })).toEqual([]);
    expect(pullRequestLookups({ branch: 'x', remotes: {}, upstream: null })).toEqual([]);
    expect(
      pullRequestLookups({
        branch: 'x',
        remotes: { origin: '/srv/git/api.git', upstream: 'git@github.com:acme/api.git' },
        upstream: null,
      }),
    ).toEqual([]);
    expect(
      pullRequestLookups({
        branch: 'x',
        remotes: { origin: 'git@github.com:me/api.git', upstream: 'https://gitlab.com/acme/api' },
        upstream: null,
      }),
    ).toEqual([{ base: fork, head: 'me:x' }]);
  });
});
