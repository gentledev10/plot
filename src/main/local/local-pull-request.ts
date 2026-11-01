import type { RepositoryRef } from '@shared/github';
import { isSameRepository, parseRepositoryRef } from '@shared/repository-ref';
import type { LocalTracking } from './local-git';

export interface PullRequestLookup {
  base: RepositoryRef;
  head: string;
}

// A branch's pull request lives in the repository it was forked from when there is one, which
// clones of a fork usually call "upstream", and otherwise in the repository the branch is pushed to.
export function pullRequestLookups({
  branch,
  remotes,
  upstream,
}: LocalTracking): PullRequestLookup[] {
  const pushedTo = parseRemote(remotes[upstream?.remote ?? 'origin']);
  if (!branch || !pushedTo) {
    return [];
  }
  const head = `${pushedTo.owner}:${upstream?.branch ?? branch}`;
  const bases: RepositoryRef[] = [];
  for (const base of [parseRemote(remotes.upstream), parseRemote(remotes.origin), pushedTo]) {
    if (
      base &&
      base.host === pushedTo.host &&
      !bases.some((existing) => isSameRepository(existing, base))
    ) {
      bases.push(base);
    }
  }
  return bases.map((base) => ({ base, head }));
}

function parseRemote(url: string | undefined): RepositoryRef | undefined {
  return url === undefined ? undefined : parseRepositoryRef(url);
}
