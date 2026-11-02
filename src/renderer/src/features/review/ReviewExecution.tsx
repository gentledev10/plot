import type { PullRequestRef } from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import type { ExecutionReport, ExecutionRequest, ExecutionSide } from '@shared/review-execution';
import type { ReviewSimulation, ScenarioValue } from '@shared/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { useT } from '../language/LanguageProvider';
import styles from './ReviewExecution.module.css';

export interface ExecutionContext {
  ref: PullRequestRef;
  head: string;
  unitId?: string;
}
export function ReviewExecution({
  context,
  simulation,
  inputs,
  paths,
}: {
  context: ExecutionContext;
  simulation?: ReviewSimulation;
  inputs?: ReadonlyMap<string, ScenarioValue>;
  paths?: string[];
}) {
  const api = useApi();
  const t = useT();
  const client = useQueryClient();
  const key = ['review-execution', pullRequestKey(context.ref), context.head];
  const support = useQuery({
    queryKey: ['review-execution-support'],
    queryFn: () => api.getReviewExecutionSupport(),
    staleTime: Infinity,
  });
  const status = useQuery({
    queryKey: key,
    queryFn: () => api.getReviewExecution(context.ref),
    refetchInterval: (q) => (q.state.data?.task.state === 'running' ? 1000 : false),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const run = useMutation({
    mutationFn: (request: ExecutionRequest) => api.runReviewExecution(context.ref, request),
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelReviewExecution(context.ref),
    onSettled: refresh,
  });
  const data = status.data?.head === context.head ? status.data : undefined;
  const running = data?.task.state === 'running';
  const values = [...(inputs ?? [])].map(([id, value]) => ({ id, value }));
  const sameInputs = (report: ExecutionReport) =>
    report.request.kind === 'scenario' &&
    JSON.stringify([...report.request.inputs].sort((a, b) => a.id.localeCompare(b.id))) ===
      JSON.stringify([...values].sort((a, b) => a.id.localeCompare(b.id)));
  const report = data?.reports
    .filter(
      (report) =>
        report.unitId === context.unitId &&
        (simulation
          ? report.request.kind === 'scenario' && report.request.simulationId === simulation.id
          : report.request.kind === 'tests' &&
            JSON.stringify(report.request.paths) === JSON.stringify(paths)),
    )
    .at(-1);
  const canRun = support.data?.available && (simulation ? !!simulation.binding : !!paths?.length);
  return (
    <section className={styles.panel} aria-label={t('Actual code execution')}>
      <h4>{t(simulation ? 'Compare actual function results' : 'Run related Node tests')}</h4>
      <p>
        {t(
          'Runs only when you click, on isolated merge-base and PR-head snapshots. Network, private files and child processes are blocked. No dependencies are installed or package scripts run.',
        )}
      </p>
      {!support.data?.available && (
        <p>{t(support.data?.reason ?? 'Checking execution support…')}</p>
      )}
      {simulation && !simulation.binding && (
        <p>
          {t(
            'This model has no executable function binding. Generate the review again or use the explanation model.',
          )}
        </p>
      )}
      {paths && <p className={styles.paths}>{paths.join(' · ')}</p>}
      <button
        type="button"
        disabled={!canRun || running || run.isPending}
        onClick={() =>
          run.mutate(
            simulation
              ? {
                  head: context.head,
                  unitId: context.unitId,
                  kind: 'scenario',
                  simulationId: simulation.id,
                  inputs: values,
                }
              : { head: context.head, unitId: context.unitId, kind: 'tests', paths: paths ?? [] },
          )
        }
      >
        {t(
          simulation
            ? 'Run actual code with these values'
            : 'Run the same head tests on both versions',
        )}
      </button>
      {running && (
        <>
          <p role="status">
            {t(
              data.task.state === 'running'
                ? (data.task.activity.at(-1) ?? 'Running isolated code')
                : 'Running isolated code',
            )}
          </p>
          <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('Cancel execution')}
          </button>
        </>
      )}
      {(run.error || support.error || status.error || cancel.error) && (
        <ErrorNotice error={run.error ?? support.error ?? status.error ?? cancel.error} />
      )}
      {data?.task.state === 'failed' && <ErrorNotice error={data.task.error} />}
      {report && (
        <>
          {simulation && !sameInputs(report) && (
            <p role="status" className={styles.stale}>
              {t(
                'Inputs changed. The results below belong to the previous values; run again to compare the current values.',
              )}
            </p>
          )}
          <p>
            {t('Executed versions')}: {report.base.slice(0, 8)} → {report.head.slice(0, 8)} · Node{' '}
            {report.nodeVersion} · {new Date(report.createdAt).toLocaleString()}
          </p>
          {report.request.kind === 'scenario' && (
            <pre>
              {JSON.stringify(
                Object.fromEntries(report.request.inputs.map(({ id, value }) => [id, value])),
                null,
                2,
              )}
            </pre>
          )}
          {report.request.kind === 'tests' && (
            <p>
              {t(
                'Both versions use the PR-head test files. A failure may indicate changed behavior or missing setup; inspect the output.',
              )}
            </p>
          )}
          {report.request.kind === 'tests' && <TestComparison report={report} />}
          <div className={styles.results}>
            {(['before', 'after'] as const).map((side) => (
              <ExecutionResult
                key={side}
                title={t(side === 'before' ? 'Before' : 'After')}
                result={report[side]}
              />
            ))}
          </div>
          {report.binding && (
            <details>
              <summary>{t('Function bindings and assumptions')}</summary>
              <pre>{JSON.stringify(report.binding, null, 2)}</pre>
            </details>
          )}
        </>
      )}
      <p>
        {t(
          'Execution covers only the selected function inputs or test files. It does not prove the whole PR is correct. Results are kept for this app session.',
        )}
      </p>
    </section>
  );
}

function TestComparison({ report }: { report: ExecutionReport }) {
  const t = useT();
  const before = report.before.tests ?? [];
  const after = report.after.tests ?? [];
  const names = [...new Set([...before, ...after].map((test) => test.name))];
  if (!names.length)
    return (
      <p>
        {t(
          'No top-level test results were captured. Inspect the output for missing setup or unsupported tests.',
        )}
      </p>
    );
  return (
    <>
      <h5>{t('Top-level test comparison')}</h5>
      <table>
        <thead>
          <tr>
            <th>{t('Test')}</th>
            <th>{t('Before')}</th>
            <th>{t('After')}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const a = before.find((entry) => entry.name === name)?.status;
            const b = after.find((entry) => entry.name === name)?.status;
            return (
              <tr key={name}>
                <td>
                  {name}
                  {a === 'passed' && b === 'failed' && <strong> · {t('New failure')}</strong>}
                </td>
                <td>{t(a ?? 'Not captured')}</td>
                <td>{t(b ?? 'Not captured')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        {t(
          'Skipped tests are not passes. Nested details and duplicate test names require checking the raw output.',
        )}
      </p>
    </>
  );
}
function ExecutionResult({ title, result }: { title: string; result: ExecutionSide }) {
  const t = useT();
  const status = {
    completed: 'Completed',
    failed: 'Failed or missing setup',
    timeout: 'Execution timed out',
    cancelled: 'Cancelled',
  }[result.status];
  return (
    <section className={styles.result}>
      <h5>
        {title} · {t(status)}
      </h5>
      <p>
        {t('Exit code')}: {result.exitCode ?? '—'}
      </p>
      {result.outcome && (
        <>
          <strong>
            {t(
              {
                return: 'Function returned',
                throw: 'Function threw',
                'setup-error': 'Execution setup error',
              }[result.outcome.kind],
            )}
          </strong>
          <pre>
            {result.outcome.valueType === 'undefined'
              ? 'undefined'
              : JSON.stringify(result.outcome.value, null, 2)}
          </pre>
        </>
      )}
      <details>
        <summary>{t('Command and output')}</summary>
        <code>{result.command.join(' ')}</code>
        <pre>
          {result.stdout}
          {result.stderr}
        </pre>
      </details>
    </section>
  );
}

function ErrorNotice({ error }: { error: unknown }) {
  const t = useT();
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : 'Execution failed.';
  return <p role="alert">{t(message)}</p>;
}
