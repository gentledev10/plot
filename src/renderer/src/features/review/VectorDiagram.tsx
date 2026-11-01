import type { Architecture, CodeLocation } from '@shared/review';
import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import styles from './VisualWalkthrough.module.css';
import { layoutVectorGraph, type VectorLayout } from './vector-layout';

export function VectorDiagram({
  graph,
  flow = false,
  label,
  onOpen,
  changedPaths,
}: {
  graph: Architecture;
  flow?: boolean;
  label: string;
  onOpen?(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
}) {
  const t = useT();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [layout, setLayout] = useState<VectorLayout>();
  const [failed, setFailed] = useState(false);
  const [readable, setReadable] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    if (!layout || !canvas.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 300));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [layout]);
  useEffect(() => {
    let active = true;
    setLayout(undefined);
    setFailed(false);
    setReadable(false);
    layoutVectorGraph(graph, flow)
      .then((result) => {
        if (active) setLayout(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [graph, flow]);
  if (failed) return <p>{t('This diagram could not be drawn.')}</p>;
  if (!layout) return <p role="status">{t('Drawing diagram…')}</p>;
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
          role="img"
          aria-label={label}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{
            width: `${layout.width * (readable ? 1 : Math.min(1, width / layout.width, 640 / layout.height))}px`,
          }}
        >
          <title>{label}</title>
          <defs>
            <marker
              id={`${id}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-text-muted)" />
            </marker>
          </defs>
          {layout.groups.map((group) => (
            <g key={group.id} className={styles.area}>
              <rect x={group.x} y={group.y} width={group.width} height={group.height} rx="12" />
              <text x={group.x + 12} y={group.y + 23}>
                {group.label.slice(0, 60)}
              </text>
            </g>
          ))}
          {layout.edges.map((edge) => (
            <g
              key={edge.index}
              className={styles.edge}
              data-inferred={graph.edges[edge.index]?.evidence === 'inferred'}
            >
              <path d={edge.path} markerEnd={`url(#${id}-arrow)`} />
              {edge.labels.map((item) => (
                <g key={`${item.x}-${item.y}-${item.text}`}>
                  <rect
                    x={item.x - 3}
                    y={item.y - 1}
                    width={item.width + 6}
                    height={item.height + 2}
                    rx="3"
                  />
                  <text x={item.x + item.width / 2} y={item.y + 13} textAnchor="middle">
                    {item.text}
                  </text>
                </g>
              ))}
            </g>
          ))}
          {layout.nodes.map((node) => {
            const source = graph.nodes[node.index];
            const location = source?.location;
            const open =
              location && onOpen && changedPaths.has(location.path)
                ? () => onOpen(location)
                : undefined;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: handlers and button semantics are present together only for navigable current-code locations
              <g
                key={node.index}
                className={styles.node}
                data-status={source?.status}
                data-inferred={source?.evidence === 'inferred'}
                role={open ? 'button' : undefined}
                tabIndex={open ? 0 : undefined}
                aria-label={open ? source?.label : undefined}
                onClick={open}
                onKeyDown={
                  open
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          open();
                        }
                      }
                    : undefined
                }
              >
                <title>{source?.label}</title>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={flow ? 6 : 10}
                />
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 - (node.lines.length - 1) * 8.5}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {node.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable text fragments have no component state; repeated lines need distinct keys
                    <tspan key={`${index}-${line}`} x={node.x + node.width / 2} dy={index ? 17 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}
