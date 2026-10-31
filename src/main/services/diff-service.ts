import type { ViewerApi } from '@shared/ipc';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubConnections } from '../github/connections';

export const MAX_BLOB_BYTES = 4 * 1024 * 1024;

export type DiffService = Pick<ViewerApi, 'getPullRequestDiff' | 'readBlob'>;

interface DiffServiceOptions {
  connections: GitHubConnections;
  repositories: RepositoryCache;
}

export function createDiffService({ connections, repositories }: DiffServiceOptions): DiffService {
  return {
    async getPullRequestDiff(ref) {
      const { client } = await connections.forHost(ref.host);
      const pull = await client.getPullRequest(ref);
      const mergeBase = await client.getMergeBase(ref, pull.base.sha, pull.head.sha);
      await repositories.fetchCommits(ref, [mergeBase, pull.head.sha]);
      const files = await repositories.diff(ref, mergeBase, pull.head.sha);
      return { mergeBase, head: pull.head.sha, files };
    },

    readBlob(ref, blob) {
      return repositories.readBlob(ref, blob, MAX_BLOB_BYTES);
    },
  };
}
