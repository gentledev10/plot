import { describe, expect, it } from 'vitest';
import { argumentParsers } from './arguments';

const repositoryId = '0123456789abcdef';
const sha = 'a'.repeat(40);
describe('local history IPC arguments', () => {
  it.each([
    { compare: 'commits' },
    { compare: 'commits', commits: [] },
    { compare: 'commits', commits: Array(101).fill(sha) },
    { compare: 'commits', commits: [sha, sha] },
    { compare: 'commits', commits: ['--help'] },
    { compare: 'commits', commits: [sha], baseRef: 'main' },
    { compare: 'commits', commits: [sha], headRef: 'HEAD' },
    { compare: 'commits', commits: [sha], includeUncommitted: true },
    { compare: 'branch', commits: [sha] },
    { compare: 'branch', includeUncommitted: 'yes' },
    { compare: 'branch', baseRef: '--output=/tmp/attack' },
    { compare: 'branch', headRef: 'HEAD~1' },
    { compare: 'uncommitted', headRef: 'feature' },
    { compare: 'uncommitted', includeUncommitted: false },
  ])('rejects invalid target %j', (options) => {
    expect(() => argumentParsers.getLocalDiff([{ repositoryId, ...options }])).toThrow();
  });
  it.each([
    '--help',
    'main..feature',
    'HEAD^{tree}',
    'x\nmain',
    'x@{1}',
    'x:path',
    '',
    '/etc/passwd',
    'x.lock',
    'a//b',
    'a/.b',
  ])('rejects unsafe history ref %j', (ref) => {
    expect(() => argumentParsers.getLocalHistory([repositoryId, ref])).toThrow();
  });

  it('preserves supported targets for diff, signatures, and local reviews', () => {
    const target = {
      repositoryId,
      compare: 'branch',
      baseRef: 'main',
      headRef: 'origin/feature',
      includeUncommitted: false,
    };
    for (const method of [
      'getLocalDiff',
      'getLocalSignature',
      'getLocalReviewStatus',
      'startLocalReview',
      'cancelLocalReview',
    ] as const) {
      expect(argumentParsers[method]([target])).toEqual([target]);
    }
    expect(
      argumentParsers.getLocalDiff([{ repositoryId, compare: 'commits', commits: [sha] }]),
    ).toEqual([{ repositoryId, compare: 'commits', commits: [sha] }]);
    expect(argumentParsers.getLocalHistory([repositoryId, 'origin/feature'])).toEqual([
      repositoryId,
      'origin/feature',
    ]);
    expect(argumentParsers.getLocalHistory([repositoryId])).toEqual([repositoryId]);
  });
});
