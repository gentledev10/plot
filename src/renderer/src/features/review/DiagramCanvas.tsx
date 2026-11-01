import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useT } from '../language/LanguageProvider';
import styles from './VisualWalkthrough.module.css';

export function DiagramCanvas({
  width,
  height,
  label,
  kind,
  children,
}: {
  width: number;
  height: number;
  label: string;
  kind: 'architecture' | 'flow' | 'sequence';
  children(id: string): ReactNode;
}) {
  const t = useT();
  const tone = useAppearance().theme.kind;
  const id = `drawing-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const canvas = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(300);
  const [readable, setReadable] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry?.contentRect.width ?? 300));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const scale = readable ? 1 : Math.min(1, available / width, 780 / height);
  return (
    <>
      <fieldset className={styles.controls} aria-label={t('Diagram size')}>
        <button type="button" aria-pressed={!readable} onClick={() => setReadable(false)}>
          {t('Fit to panel')}
        </button>
        <button type="button" aria-pressed={readable} onClick={() => setReadable(true)}>
          {t('Readable size')}
        </button>
      </fieldset>
      <div ref={canvas} className={styles.canvas}>
        <svg
          className={styles.drawing}
          data-tone={tone}
          data-kind={kind}
          role="img"
          aria-label={label}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${width * scale}px` }}
        >
          <title>{label}</title>
          <defs>
            <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity={tone === 'dark' ? 0.2 : 0.09}
              />
            </filter>
            <marker
              id={`${id}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path
                d="M1,1 L7,4 L1,7"
                fill="none"
                stroke="var(--drawing-wire)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
            <pattern id={`${id}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.7" fill="var(--drawing-dot)" />
            </pattern>
          </defs>
          <rect width={width} height={height} rx="18" fill="var(--drawing-bg)" />
          <rect width={width} height={height} rx="18" fill={`url(#${id}-dots)`} />
          {children(id)}
        </svg>
      </div>
    </>
  );
}
