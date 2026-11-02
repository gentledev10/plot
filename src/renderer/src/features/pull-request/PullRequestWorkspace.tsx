import type { PullRequestRef } from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import { reviewUnitCoverage } from '@shared/review-unit';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DiffWorkspace, type WorkspaceSelection } from '../diff/DiffWorkspace';
import { usePullRequestDiff } from '../diff/queries';
import { useReviewStatus } from '../review/queries';
import { useReviewPlan } from '../review/ReviewPlanProvider';
import { useReviewReading } from '../review/ReviewReadingProvider';
import { ReviewUnitsBar } from '../review/ReviewUnitsBar';
import { PullRequestHeader } from './PullRequestHeader';
import { pullRequestKeys } from './queries';

interface PullRequestWorkspaceProps extends WorkspaceSelection {
  target: PullRequestRef;
}

export function PullRequestWorkspace({ target, ...selection }: PullRequestWorkspaceProps) {
  const queryClient = useQueryClient();
  const status = useReviewStatus(target);
  const diff = usePullRequestDiff(target);
  const { plan } = useReviewPlan();
  const { focus, select } = useReviewReading();
  const key = pullRequestKey(target);
  const done = status.data?.state === 'done' ? status.data : undefined;
  const units =
    done?.head === diff.data?.head &&
    plan.steps.some((step) => step.kind === 'changes' && step.visible)
      ? (done?.review.units ?? [])
      : [];
  const active = focus?.target === key && focus.head === done?.head ? focus : undefined;
  const coverage = reviewUnitCoverage(units, diff.data?.files.map((file) => file.path) ?? []);
  const unit =
    active?.mode === 'unit' ? units.find((unit) => unit.id === active.unitId) : undefined;
  const focusedFiles =
    unit?.files ??
    (active?.mode === 'remaining'
      ? coverage.remaining.map((path) => ({
          path,
          role: 'other' as const,
          reason: '',
          ranges: [],
          beforeRanges: [],
        }))
      : undefined);
  const onSelect = (value: string) => {
    if (!done) return;
    const selected = value.startsWith('unit:')
      ? units.find((unit) => unit.id === value.slice(5))
      : undefined;
    select({
      target: key,
      head: done.head,
      mode: selected ? 'unit' : value === 'remaining' ? 'remaining' : 'all',
      unitId: selected?.id,
      paths:
        selected?.files.map((file) => file.path) ??
        (value === 'remaining' ? coverage.remaining : undefined),
    });
    const path =
      selected?.files[0]?.path ?? (value === 'remaining' ? coverage.remaining[0] : undefined);
    if (path) selection.onSelectPath(path);
  };
  useEffect(() => {
    const first = units[0];
    if (!done || !first || active) return;
    select({
      target: key,
      head: done.head,
      mode: 'unit',
      unitId: first.id,
      paths: first.files.map((file) => file.path),
    });
    const path = first.files[0]?.path;
    if (path) selection.onSelectPath(path);
  }, [done, units, active, key, select, selection.onSelectPath]);
  return (
    <DiffWorkspace
      target={{ kind: 'pull-request', ref: target }}
      header={
        <>
          <PullRequestHeader target={target} />
          {units.length > 0 && (
            <ReviewUnitsBar
              units={units}
              selected={
                unit ? `unit:${unit.id}` : active?.mode === 'remaining' ? 'remaining' : 'all'
              }
              remaining={coverage.remaining.length}
              linked={coverage.linked}
              total={coverage.total}
              onSelect={onSelect}
            />
          )}
        </>
      }
      focusFiles={units.length ? focusedFiles : undefined}
      scopeKey={unit?.id ?? active?.mode}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: pullRequestKeys.detail(target) });
      }}
      {...selection}
    />
  );
}
