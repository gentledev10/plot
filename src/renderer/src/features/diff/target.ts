import type { PullRequestRef } from '@shared/github';
import type { LocalCompare, LocalTarget } from '@shared/local';
import { pullRequestKey } from '@shared/pull-request-ref';

export type DiffTarget =
  | { kind: 'pull-request'; ref: PullRequestRef }
  | { kind: 'local'; repositoryId: string; compare: LocalCompare };

export function localTargetOf(target: Extract<DiffTarget, { kind: 'local' }>): LocalTarget {
  return { repositoryId: target.repositoryId, compare: target.compare };
}

export function targetKey(target: DiffTarget): string {
  return target.kind === 'pull-request'
    ? `pull-request:${pullRequestKey(target.ref)}`
    : `local:${target.repositoryId}:${target.compare}`;
}
