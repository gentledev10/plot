import type { ChangedFile } from '@shared/diff';
import type { PullRequestDetail } from '@shared/github';
import { describe, expect, it, vi } from 'vitest';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubClient } from '../github/client';
import { createDiffService, MAX_BLOB_BYTES } from './diff-service';

const ref = { owner: 'octocat', repo: 'hello-world', number: 42 };
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const MERGE_BASE = 'c'.repeat(40);

const file: ChangedFile = {
  path: 'src/app.ts',
  status: 'modified',
  kind: 'file',
  oldBlob: 'd'.repeat(40),
  newBlob: 'e'.repeat(40),
  additions: 1,
  deletions: 1,
};

function setup() {
  const github = {
    getPullRequest: vi.fn().mockResolvedValue({
      base: { ref: 'main', sha: BASE },
      head: { ref: 'feature', sha: HEAD },
    } as PullRequestDetail),
    getMergeBase: vi.fn().mockResolvedValue(MERGE_BASE),
  } as unknown as GitHubClient;
  const repositories: RepositoryCache = {
    fetchCommits: vi.fn().mockResolvedValue(undefined),
    diff: vi.fn().mockResolvedValue([file]),
    readBlob: vi.fn().mockResolvedValue({ kind: 'text', text: 'hi' }),
    unifiedDiff: vi.fn(),
    listFiles: vi.fn(),
    checkoutDirectories: vi.fn(),
    removeCheckout: vi.fn(),
  };
  return { service: createDiffService({ github, repositories }), github, repositories };
}

describe('getPullRequestDiff', () => {
  it('diffs the head against the merge base, like GitHub does', async () => {
    const { service, github, repositories } = setup();

    await expect(service.getPullRequestDiff(ref)).resolves.toEqual({
      mergeBase: MERGE_BASE,
      head: HEAD,
      files: [file],
    });
    expect(github.getMergeBase).toHaveBeenCalledWith(ref, BASE, HEAD);
    expect(repositories.fetchCommits).toHaveBeenCalledWith(ref, [MERGE_BASE, HEAD]);
    expect(repositories.diff).toHaveBeenCalledWith(ref, MERGE_BASE, HEAD);
  });

  it('fetches before diffing', async () => {
    const { service, repositories } = setup();
    const order: string[] = [];
    vi.mocked(repositories.fetchCommits).mockImplementation(async () => {
      order.push('fetch');
    });
    vi.mocked(repositories.diff).mockImplementation(async () => {
      order.push('diff');
      return [];
    });

    await service.getPullRequestDiff(ref);
    expect(order).toEqual(['fetch', 'diff']);
  });
});

describe('readBlob', () => {
  it('caps the size of files sent to the renderer', async () => {
    const { service, repositories } = setup();
    await service.readBlob(ref, 'd'.repeat(40));
    expect(repositories.readBlob).toHaveBeenCalledWith(ref, 'd'.repeat(40), MAX_BLOB_BYTES);
  });
});
