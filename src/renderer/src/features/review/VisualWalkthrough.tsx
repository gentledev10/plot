import type { Architecture, CodeLocation, ReviewVisual } from '@shared/review';
import { type ReactNode, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import { SequenceDiagram } from './SequenceDiagram';
import { VectorDiagram } from './VectorDiagram';
import styles from './VisualWalkthrough.module.css';

export function VisualWalkthrough({
  visuals,
  onOpenLocation,
  changedPaths,
  link,
  onExpand,
}: {
  visuals: ReviewVisual[];
  onOpenLocation(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
  link(location: CodeLocation | undefined): ReactNode;
  onExpand?(): void;
}) {
  const t = useT();
  return (
    <div>
      {onExpand && (
        <button type="button" className={styles.expand} onClick={onExpand}>
          {t('Enlarge diagrams')}
        </button>
      )}
      {visuals.map((visual) => (
        <Visual
          key={`${visual.kind}-${visual.title}`}
          visual={visual}
          onOpenLocation={onOpenLocation}
          changedPaths={changedPaths}
          link={link}
        />
      ))}
    </div>
  );
}

function Visual({
  visual,
  onOpenLocation,
  changedPaths,
  link,
}: {
  visual: ReviewVisual;
  onOpenLocation(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
  link(location: CodeLocation | undefined): ReactNode;
}) {
  const t = useT();
  const [selected, setSelected] = useState<'before' | 'after' | 'both'>();
  const both = !!visual.before && !!visual.after;
  const view = both ? (selected ?? 'after') : visual.after ? 'after' : 'before';
  const graphs = [
    ...(visual.before && view !== 'after'
      ? [{ side: 'before' as const, graph: visual.before }]
      : []),
    ...(visual.after && view !== 'before' ? [{ side: 'after' as const, graph: visual.after }] : []),
  ];
  return (
    <section className={styles.visual} aria-label={visual.title}>
      <div className={styles.heading}>
        <span className={styles.kind}>
          {t(
            visual.kind === 'components'
              ? 'Architecture diagram'
              : visual.kind === 'sequence'
                ? 'Sequence diagram'
                : 'Flow diagram',
          )}
        </span>
        <h4>{visual.title}</h4>
      </div>
      <p className={styles.takeaway}>{visual.takeaway}</p>
      {both && (
        <fieldset
          className={styles.controls}
          aria-label={t('Compare diagrams: {title}', { title: visual.title })}
        >
          {(['before', 'after', 'both'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setSelected(option)}
            >
              {t(option === 'before' ? 'Before' : option === 'after' ? 'After' : 'Side by side')}
            </button>
          ))}
        </fieldset>
      )}
      <div className={styles.pair} data-paired={view === 'both'}>
        {graphs.map(({ side, graph }) => (
          <div key={side} className={styles.pane}>
            <h5>{t(side === 'before' ? 'Before' : 'After')}</h5>
            <Graph
              graph={graph}
              kind={visual.kind}
              label={`${visual.title} · ${t(side === 'before' ? 'Before' : 'After')}`}
              changedPaths={changedPaths}
              onOpen={side === 'after' ? onOpenLocation : undefined}
            />
          </div>
        ))}
      </div>
      <details className={styles.evidence}>
        <summary>{t('Diagram evidence and scope')}</summary>
        <p>{visual.scope}</p>
        <ul>
          {visual.after?.nodes
            .filter((node) => node.location)
            .map((node) => (
              <li key={node.id}>
                {node.label}{' '}
                {node.evidence === 'inferred' && <span>{t('Inference — check this')}</span>}{' '}
                {link(node.location)}
              </li>
            ))}
        </ul>
      </details>
    </section>
  );
}

function Graph({
  graph,
  kind,
  label,
  onOpen,
  changedPaths,
}: {
  graph: Architecture;
  kind: ReviewVisual['kind'];
  label: string;
  onOpen?(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
}) {
  return kind === 'sequence' ? (
    <SequenceDiagram graph={graph} label={label} onOpen={onOpen} changedPaths={changedPaths} />
  ) : (
    <VectorDiagram
      graph={graph}
      flow={kind === 'flowchart'}
      label={label}
      onOpen={onOpen}
      changedPaths={changedPaths}
    />
  );
}
