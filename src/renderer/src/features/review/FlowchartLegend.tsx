import type { FlowRole } from '@shared/flowchart';
import { useT } from '../language/LanguageProvider';
import { flowSymbolPath } from './flowchart-geometry';
import styles from './VisualWalkthrough.module.css';

export function FlowchartLegend() {
  const t = useT();
  const symbols: { role: FlowRole; label: string }[] = [
    { role: 'start', label: 'Start / end' },
    { role: 'process', label: 'Process' },
    { role: 'decision', label: 'Decision' },
    { role: 'input', label: 'Input / output' },
  ];
  const box = { x: 2, y: 2, width: 40, height: 26 };
  return (
    <details className={styles.symbols}>
      <summary>{t('Flowchart symbols')}</summary>
      <ul>
        {symbols.map(({ role, label }) => {
          const path = flowSymbolPath(role, box);
          return (
            <li key={role}>
              <svg viewBox="0 0 44 30" width="44" height="30" aria-hidden="true">
                {path ? <path d={path} /> : <rect {...box} rx={role === 'start' ? 13 : 0} />}
              </svg>
              <span>{t(label)}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
