import type { PullRequestSummary } from '@shared/github';
import { describe, expect, it, vi } from 'vitest';
import type { LocalGit } from '../local/local-git';
import type { LocalRepositoryStore } from '../local/local-repositories';
import { createLocalService } from './local-service';

const pull = { ref: { host: 'github.com', owner: 'acme', repo: 'api', number: 7 } };

function setup(findOpenPullRequest: (base: unknown, head: string) => Promise<unknown>) {
  const git = {
    tracking: vi.fn().mockResolvedValue({
      branch: 'retry',
      remotes: {
        origin: 'https://github.com/me/api.git',
        upstream: 'https://github.com/acme/api.git',
      },
      upstream: { remote: 'origin', branch: 'retry' },
    }),
  } as unknown as LocalGit;
  const repositories = {
    root: vi.fn().mockResolvedValue('/work/api'),
  } as unknown as LocalRepositoryStore;
  return createLocalService({
    repositories,
    git,
    chooseFolder: vi.fn(),
    findOpenPullRequest: vi.fn(findOpenPullRequest) as unknown as (
      base: never,
      head: string,
    ) => Promise<PullRequestSummary | null>,
  });
}

describe('local history service', () => {
  it('resolves the opaque repository id and forwards all comparison options', async () => {
    const git = {
      history: vi.fn().mockResolvedValue({ branches: [], commits: [], hasMore: false }),
      diff: vi.fn().mockResolvedValue({ files: [] }),
      signature: vi.fn().mockResolvedValue('signature'),
    };
    const repositories = { root: vi.fn().mockResolvedValue('/work/api') };
    const service = createLocalService({
      repositories: repositories as unknown as LocalRepositoryStore,
      git: git as unknown as LocalGit,
      chooseFolder: vi.fn(),
      findOpenPullRequest: vi.fn(),
    });
    const target = {
      repositoryId: '0123456789abcdef',
      compare: 'branch' as const,
      baseRef: 'main',
      headRef: 'feature',
      includeUncommitted: false,
    };
    await service.getLocalDiff(target);
    await service.getLocalSignature(target);
    await service.getLocalHistory(target.repositoryId, 'feature');
    expect(git.diff).toHaveBeenCalledWith('/work/api', 'branch', {
      baseRef: 'main',
      headRef: 'feature',
      includeUncommitted: false,
    });
    expect(git.signature).toHaveBeenCalledWith('/work/api', 'branch', {
      baseRef: 'main',
      headRef: 'feature',
      includeUncommitted: false,
    });
    expect(git.history).toHaveBeenCalledWith('/work/api', 'feature');
    expect(repositories.root).toHaveBeenCalledWith(target.repositoryId);
  });
});

describe('findLocalPullRequest', () => {
  it('finds the pull request of the checked-out branch, trying the forked repository first', async () => {
    const asked: string[] = [];
    const service = setup(async (base, head) => {
      asked.push(`${(base as { owner: string }).owner} ${head}`);
      return (base as { owner: string }).owner === 'me' ? pull : null;
    });

    await expect(service.findLocalPullRequest('0123456789abcdef')).resolves.toEqual(pull);
    expect(asked).toEqual(['acme me:retry', 'me me:retry']);
  });

  it('returns nothing when no repository has one', async () => {
    const service = setup(async () => null);
    await expect(service.findLocalPullRequest('0123456789abcdef')).resolves.toBeNull();
  });
});
