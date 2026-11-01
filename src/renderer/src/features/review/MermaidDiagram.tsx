import { useEffect, useId, useRef, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useT } from '../language/LanguageProvider';
import styles from './ReviewPanel.module.css';

interface MermaidDiagramProps {
  source: string;
  label: string;
  fit?: boolean;
  onElementClick?(elementId: string): void;
}
export function MermaidDiagram({
  source,
  label,
  onElementClick,
  fit = false,
}: MermaidDiagramProps) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const scheme = useAppearance().theme.kind;
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [failed, setFailed] = useState(false);
  const [large, setLarge] = useState(false);
  const [readable, setReadable] = useState(false);
  const latestClick = useRef(onElementClick);
  latestClick.current = onElementClick;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: scheme === 'dark' ? 'dark' : 'default',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 16,
        flowchart: {
          htmlLabels: false,
        },
      });
      const { svg } = await mermaid.render(id, source);
      if (!cancelled && container.current) {
        container.current.innerHTML = svg;
        const width = container.current.querySelector('svg')?.viewBox.baseVal.width ?? 0;
        container.current.style.setProperty('--diagram-readable-width', `${width * 0.875}px`);
        setLarge(width > 640);
        setReadable(false);
        setFailed(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, source, scheme]);
  if (failed) {
    return <p className={styles.muted}>{t('This diagram could not be drawn.')}</p>;
  }
  return (
    <>
      {fit && large && (
        <fieldset className={styles.mapViews} aria-label={t('Diagram size')}>
          <button type="button" aria-pressed={!readable} onClick={() => setReadable(false)}>
            {t('Fit to panel')}
          </button>
          <button type="button" aria-pressed={readable} onClick={() => setReadable(true)}>
            {t('Readable size')}
          </button>
        </fieldset>
      )}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: every clickable node also appears in the keyboard-accessible list below the diagram */}
      <div
        ref={container}
        className={styles.diagram}
        data-fit={fit}
        data-readable={readable}
        role="img"
        aria-label={label}
        onClick={(event) => {
          const node = (event.target as Element).closest('g.node');
          if (node?.id) {
            latestClick.current?.(node.id);
          }
        }}
      />
    </>
  );
}
