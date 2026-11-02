import type { Architecture, CodeLocation } from '@shared/review';
import {
  evaluateScenario,
  type ReviewSimulation,
  type ScenarioCategory,
  type ScenarioProgram,
  type ScenarioTrace,
  type ScenarioValue,
  scenarioCoverage,
  scenarioDefaults,
} from '@shared/simulation';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import styles from './BehaviorSimulation.module.css';
import { VectorDiagram } from './VectorDiagram';

const categories: Record<ScenarioCategory, string> = {
  normal: 'Normal input',
  boundary: 'Boundary value',
  'invalid-input': 'Invalid input',
  'dependency-failure': 'Dependency failure',
  permission: 'Permission',
  state: 'State transition',
};

export function BehaviorSimulation({
  simulation,
  changedPaths,
  onOpenLocation,
  link,
  onExpand,
}: {
  simulation: ReviewSimulation;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  link(location: CodeLocation | undefined): ReactNode;
  onExpand?(): void;
}) {
  const t = useT();
  const id = useId();
  const [inputs, setInputs] = useState(() => scenarioDefaults(simulation));
  const [selected, setSelected] = useState('default');
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setInputs(scenarioDefaults(simulation));
    setSelected('default');
  }, [simulation]);
  const before = useMemo(() => evaluateScenario(simulation.before, inputs), [simulation, inputs]);
  const after = useMemo(() => evaluateScenario(simulation.after, inputs), [simulation, inputs]);
  const differs =
    before.outcome &&
    after.outcome &&
    (before.outcome.kind !== after.outcome.kind || before.outcome.value !== after.outcome.value);
  const currentCase = simulation.cases.find((scenario) => scenario.id === selected);
  const changeInput = (key: string, value: ScenarioValue) => {
    setInputs((previous) => new Map(previous).set(key, value));
    setSelected('custom');
  };
  return (
    <details className={styles.container}>
      <summary>{t('Try inputs and error cases')}</summary>
      <div className={styles.body}>
        <div className={styles.heading}>
          <h4>{simulation.title}</h4>
          {onExpand && (
            <button type="button" onClick={onExpand}>
              {t('Enlarge diagrams')}
            </button>
          )}
        </div>
        <p className={styles.notice}>
          {t(
            'AI explanation model. Repository code and tests are not executed here. A predicted error path is not a confirmed bug.',
          )}
        </p>
        <label className={styles.scenario} htmlFor={`${id}-scenario`}>
          {t('Scenario')}
          <select
            id={`${id}-scenario`}
            value={selected}
            onChange={(event) => {
              const key = event.target.value;
              setSelected(key);
              if (key === 'default') setInputs(scenarioDefaults(simulation));
              else {
                const scenario = simulation.cases.find((candidate) => candidate.id === key);
                if (scenario)
                  setInputs(new Map(scenario.inputs.map((input) => [input.id, input.value])));
              }
            }}
          >
            <option value="default">{t('Default inputs')}</option>
            <option value="custom">{t('Custom inputs')}</option>
            {simulation.cases.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {t(categories[scenario.category])} · {scenario.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.inputs}>
          {simulation.inputs.map((input) => {
            const value = inputs.get(input.id) ?? null;
            const inputId = `${id}-${input.id}`;
            return (
              <fieldset key={input.id} className={styles.input}>
                <legend>{input.label}</legend>
                {input.kind === 'boolean' ? (
                  <select
                    aria-label={input.label}
                    disabled={value === null}
                    value={String(value)}
                    onChange={(event) => changeInput(input.id, event.target.value === 'true')}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                    {typeof value !== 'boolean' && (
                      <option value={String(value)}>{displayValue(value)}</option>
                    )}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    aria-label={input.label}
                    type="text"
                    inputMode={input.kind === 'number' ? 'decimal' : 'text'}
                    disabled={value === null}
                    value={value === null ? '' : String(value)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const numeric = raw.trim() !== '' && Number.isFinite(Number(raw));
                      changeInput(input.id, input.kind === 'number' && numeric ? Number(raw) : raw);
                    }}
                  />
                )}
                <label className={styles.nullInput}>
                  <input
                    type="checkbox"
                    checked={value === null}
                    onChange={(event) =>
                      changeInput(input.id, event.target.checked ? null : (input.default ?? ''))
                    }
                  />
                  {t('No value (null)')}
                </label>
                <span className={styles.legend}>
                  {t('Value type: {type}', { type: value === null ? 'null' : typeof value })}
                </span>
              </fieldset>
            );
          })}
        </div>
        {currentCase?.question && (
          <p className={styles.question}>{t('Check: {what}', { what: currentCase.question })}</p>
        )}
        <p className={styles.result} role="status">
          {differs && <strong>{t('Different modeled outcomes for these inputs')}. </strong>}
          {t('Before')}: {outcomeLabel(before, t)} · {t('After')}: {outcomeLabel(after, t)}
        </p>
        <fieldset className={styles.views} aria-label={t('Behavior diagram view')}>
          <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>
            {t('Current input path')}
          </button>
          <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>
            {t('All branches')}
          </button>
        </fieldset>
        <div className={styles.pair}>
          {(['before', 'after'] as const).map((side) => (
            <ScenarioSide
              key={side}
              side={side}
              program={simulation[side]}
              trace={side === 'before' ? before : after}
              showAll={showAll}
              changedPaths={changedPaths}
              onOpenLocation={onOpenLocation}
              link={link}
            />
          ))}
        </div>
        <details className={styles.scope}>
          <summary>{t('Model scope and unexplored branches')}</summary>
          <p>{simulation.scope}</p>
          {(['before', 'after'] as const).map((side) => {
            const coverage = scenarioCoverage(simulation, side);
            return (
              <p key={side}>
                {t(side === 'before' ? 'Before' : 'After')}:{' '}
                {t(
                  'Preset cases reach {covered} of {total} model branches. This is not code coverage.',
                  coverage,
                )}
              </p>
            );
          })}
        </details>
      </div>
    </details>
  );
}

function ScenarioSide({
  side,
  program,
  trace,
  showAll,
  changedPaths,
  onOpenLocation,
  link,
}: {
  side: 'before' | 'after';
  program: ScenarioProgram;
  trace: ScenarioTrace;
  showAll: boolean;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  link(location: CodeLocation | undefined): ReactNode;
}) {
  const t = useT();
  const fullGraph = useMemo<Architecture>(
    () => ({
      nodes: program.nodes.map((node) => ({
        id: node.id,
        label: scenarioNodeLabel(node),
        status: 'unchanged',
        ...(side === 'after' && node.location ? { location: node.location } : {}),
      })),
      edges: program.nodes.flatMap((node) =>
        node.kind === 'condition'
          ? [
              { from: node.id, to: node.yes, label: t('Yes') },
              { from: node.id, to: node.no, label: t('No') },
            ]
          : [],
      ),
    }),
    [program, side, t],
  );
  const visited = new Map(trace.nodes.map((node) => [node.id, node]));
  const edges = new Set<number>();
  let index = 0;
  for (const node of program.nodes) {
    if (node.kind !== 'condition') continue;
    const branch = visited.get(node.id)?.branch;
    if (branch !== undefined) edges.add(index + (branch ? 0 : 1));
    index += 2;
  }
  const signature = trace.nodes.map((node) => `${node.id}:${node.branch}`).join(',');
  // Reuse layout while values change within the same path.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature represents the visited ids and branch choices, avoiding layout on every keystroke
  const graph = useMemo<Architecture>(
    () =>
      showAll
        ? fullGraph
        : {
            nodes: fullGraph.nodes.filter((node) => visited.has(node.id)),
            edges: fullGraph.edges.filter((_, i) => edges.has(i)),
          },
    [showAll, fullGraph, signature],
  );
  return (
    <section
      className={styles.side}
      aria-label={t(side === 'before' ? 'Before model' : 'After model')}
    >
      <h5>{t(side === 'before' ? 'Before' : 'After')}</h5>
      <p className={styles.legend}>{t('Highlighted: path for the current inputs')}</p>
      <VectorDiagram
        graph={graph}
        flow
        direction="DOWN"
        label={t(side === 'before' ? 'Before model' : 'After model')}
        changedPaths={changedPaths}
        onOpen={side === 'after' ? onOpenLocation : undefined}
        trace={{
          nodes: new Set(visited.keys()),
          edges: showAll ? edges : new Set(graph.edges.map((_, i) => i)),
        }}
      />
      <p className={styles.outcome} data-error={trace.outcome?.kind === 'error'}>
        {trace.outcome?.kind === 'error' ? t('Predicted error path') : t('Predicted result')}:{' '}
        {outcomeLabel(trace, t)}
      </p>
      <details className={styles.trace}>
        <summary>{t('Follow conditions and code')}</summary>
        <ol>
          {trace.nodes.map((step) => {
            const node = program.nodes.find((candidate) => candidate.id === step.id);
            return (
              <li key={step.id}>
                {node?.label}
                {'input' in step && (
                  <span>
                    {' '}
                    · {displayValue(step.input ?? null)} →{' '}
                    {t(step.branch === undefined ? 'Not modeled' : step.branch ? 'Yes' : 'No')}
                  </span>
                )}
                {side === 'after' && link(node?.location)}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}

function scenarioNodeLabel(node: ScenarioProgram['nodes'][number]): string {
  if (node.kind !== 'condition') return `${node.label}: ${displayValue(node.value)}`;
  const symbols: Record<string, string> = {
    eq: '===',
    neq: '!==',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: 'contains',
  };
  const symbol = symbols[node.operator];
  return symbol ? `${node.label} · ${symbol} ${displayValue(node.value)}` : node.label;
}

function displayValue(value: ScenarioValue): string {
  return typeof value === 'string'
    ? JSON.stringify(value)
    : value === null
      ? 'null'
      : String(value);
}

function outcomeLabel(trace: ScenarioTrace, t: ReturnType<typeof useT>): string {
  return trace.outcome
    ? `${trace.outcome.label} (${displayValue(trace.outcome.value)})`
    : t('Model could not determine a result');
}
