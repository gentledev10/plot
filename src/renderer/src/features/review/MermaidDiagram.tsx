import { useEffect, useId, useRef, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useT } from '../language/LanguageProvider';
import styles from './ReviewPanel.module.css';

interface MermaidDiagramProps {
  source: string;
  label: string;
  onElementClick?(elementId: string): void;
}
export function MermaidDiagram({ source, label, onElementClick }: MermaidDiagramProps) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const scheme = useAppearance().theme.kind;
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [failed, setFailed] = useState(false);
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
        flowchart: {
          htmlLabels: false,
        },
      });
      const { svg } = await mermaid.render(id, source);
      if (!cancelled && container.current) {
        container.current.innerHTML = svg;
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: every clickable node also appears in the keyboard-accessible list below the diagram
    <div
      ref={container}
      className={styles.diagram}
      role="img"
      aria-label={label}
      onClick={(event) => {
        const node = (event.target as Element).closest('g.node');
        if (node?.id) {
          latestClick.current?.(node.id);
        }
      }}
    />
  );
}
