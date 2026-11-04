import type { PullRequestRef } from '@shared/github';
import type { LocalTarget } from '@shared/local';
import { pullRequestKey } from '@shared/pull-request-ref';

export type DiffTarget =
  | { kind: 'pull-request'; ref: PullRequestRef }
  | ({ kind: 'local' } & LocalTarget);

export function localTargetOf(target: Extract<DiffTarget, { kind: 'local' }>): LocalTarget {
  const { kind: _kind, ...local } = target;
  return local;
}

export function targetKey(target: DiffTarget): string {
  return target.kind === 'pull-request'
    ? `pull-request:${pullRequestKey(target.ref)}`
    : `local:${JSON.stringify(localTargetOf(target))}`;
}
