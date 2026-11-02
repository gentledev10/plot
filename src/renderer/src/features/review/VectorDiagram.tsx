import type { Architecture, CodeLocation } from '@shared/review';
import { useEffect, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import { DiagramCanvas } from './DiagramCanvas';
import { DiagramGlyph } from './DiagramGlyph';
import styles from './VisualWalkthrough.module.css';
import { labelLines, layoutVectorGraph, type VectorLayout } from './vector-layout';

export function VectorDiagram({
  graph,
  flow = false,
  label,
  onOpen,
  changedPaths,
  trace,
  direction,
}: {
  graph: Architecture;
  flow?: boolean;
  label: string;
  onOpen?(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
  trace?: { nodes: ReadonlySet<string>; edges: ReadonlySet<number> };
  direction?: 'DOWN' | 'RIGHT';
}) {
  const t = useT();
  const [layout, setLayout] = useState<VectorLayout>();
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<number>();
  useEffect(() => {
    let current = true;
    setLayout(undefined);
    setFailed(false);
    setActive(undefined);
    layoutVectorGraph(graph, flow, direction)
      .then((result) => {
        if (current) setLayout(result);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [graph, flow, direction]);
  if (failed) return <p>{t('This diagram could not be drawn.')}</p>;
  if (!layout) return <p role="status">{t('Drawing diagram…')}</p>;
  const selected = active === undefined ? undefined : graph.nodes[active]?.id;
  const connected = new Set(
    selected
      ? [
          selected,
          ...graph.edges.flatMap((edge) =>
            edge.from === selected ? [edge.to] : edge.to === selected ? [edge.from] : [],
          ),
        ]
      : [],
  );
  return (
    <DiagramCanvas
      width={layout.width}
      height={layout.height}
      label={label}
      kind={flow ? 'flow' : 'architecture'}
      minimumScale={trace ? 0.8 : 0}
    >
      {(id) => (
        <>
          {layout.groups.map((group) => (
            <g key={group.id} className={styles.area} data-palette={group.palette}>
              <rect
                className={styles.areaBody}
                x={group.x}
                y={group.y}
                width={group.width}
                height={group.height}
                rx="20"
              />
            </g>
          ))}
          {layout.edges.map((edge) => {
            const source = graph.edges[edge.index];
            const highlighted =
              selected !== undefined && (source?.from === selected || source?.to === selected);
            return (
              <g
                key={edge.index}
                className={styles.edge}
                data-active={highlighted}
                data-traced={trace ? trace.edges.has(edge.index) : undefined}
                data-dimmed={selected !== undefined && !highlighted}
                data-inferred={source?.evidence === 'inferred'}
              >
                <path className={styles.wireHalo} d={edge.path} />
                <path className={styles.wire} d={edge.path} markerEnd={`url(#${id}-arrow)`} />
                {edge.labels.map((item) => (
                  <g key={`${item.x}-${item.y}-${item.text}`}>
                    <rect
                      className={styles.edgeCaption}
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      height={item.height}
                      rx="8"
                    />
                    <text
                      className={styles.edgeText}
                      x={item.x + item.width / 2}
                      y={item.y + 18}
                      textAnchor="middle"
                    >
                      {item.lines.map((line, index) => (
                        <tspan
                          // biome-ignore lint/suspicious/noArrayIndexKey: static text fragments have no state
                          key={`${index}-${line}`}
                          x={item.x + item.width / 2}
                          dy={index ? 18 : 0}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
          {layout.groups.map((group) => (
            <AreaHeading key={group.id} group={group} />
          ))}
          {layout.nodes.map((node) => {
            const source = graph.nodes[node.index];
            const location = source?.location;
            const open =
              location && onOpen && changedPaths.has(location.path)
                ? () => onOpen(location)
                : undefined;
            const radius = node.role === 'app' ? 42 : 16;
            const textX = node.x + 73;
            const textY = node.y + node.height / 2 - (node.lines.length - 1) * 9.5;
            const decision = node.role === 'decision';
            const shape = decision
              ? `M${node.x + 22},${node.y} H${node.x + node.width - 22} L${node.x + node.width},${node.y + 24} V${node.y + node.height - 24} L${node.x + node.width - 22},${node.y + node.height} H${node.x + 22} L${node.x},${node.y + node.height - 24} V${node.y + 24} Z`
              : undefined;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: current-code locations alone receive button semantics and navigation; hover only traces relationships
              <g
                key={node.index}
                className={styles.node}
                data-role={node.role}
                data-palette={node.palette}
                data-status={source?.status}
                data-active={active === node.index}
                data-traced={trace ? trace.nodes.has(source?.id ?? '') : undefined}
                data-dimmed={selected !== undefined && !connected.has(source?.id ?? '')}
                data-inferred={source?.evidence === 'inferred'}
                role={open ? 'button' : undefined}
                tabIndex={open ? 0 : undefined}
                aria-label={open ? source?.label : undefined}
                onPointerEnter={() => setActive(node.index)}
                onPointerLeave={() => setActive(undefined)}
                onFocus={() => setActive(node.index)}
                onBlur={() => setActive(undefined)}
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
                {shape ? (
                  <path className={styles.nodeBody} d={shape} filter={`url(#${id}-shadow)`} />
                ) : (
                  <rect
                    className={styles.nodeBody}
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={radius}
                    filter={`url(#${id}-shadow)`}
                  />
                )}
                {node.role !== 'app' && (
                  <rect
                    className={styles.nodeAccent}
                    x={node.x + 1}
                    y={node.y + 19}
                    width="3"
                    height={node.height - 38}
                    rx="2"
                  />
                )}
                <rect
                  className={styles.nodeIcon}
                  x={node.x + 16}
                  y={node.y + node.height / 2 - 21}
                  width="42"
                  height="42"
                  rx={node.role === 'app' ? 21 : 12}
                />
                <g className={styles.glyph}>
                  <DiagramGlyph
                    role={node.role}
                    x={node.x + 25}
                    y={node.y + node.height / 2 - 12}
                  />
                </g>
                <text className={styles.nodeText} x={textX} y={textY} dominantBaseline="central">
                  {node.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable label fragments can repeat
                    <tspan key={`${index}-${line}`} x={textX} dy={index ? 19 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
                {source?.status === 'added' && (
                  <g className={styles.addedMark}>
                    <circle cx={node.x + node.width - 7} cy={node.y + 7} r="9" />
                    <path
                      d={`M${node.x + node.width - 11},${node.y + 7} h8 M${node.x + node.width - 7},${node.y + 3} v8`}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </>
      )}
    </DiagramCanvas>
  );
}

function AreaHeading({ group }: { group: VectorLayout['groups'][number] }) {
  const lines = labelLines(group.label, (group.width - 72) / 15).slice(0, 2);
  return (
    <g className={styles.area} data-palette={group.palette}>
      <rect
        className={styles.areaHeader}
        x={group.x + 9}
        y={group.y + 9}
        width={group.width - 18}
        height="42"
        rx="12"
      />
      <rect
        className={styles.areaIcon}
        x={group.x + 17}
        y={group.y + 17}
        width="26"
        height="26"
        rx="8"
      />
      <g className={styles.glyph}>
        <DiagramGlyph role={group.role} x={group.x + 22} y={group.y + 22} size={16} />
      </g>
      <text
        className={styles.areaTitle}
        x={group.x + 53}
        y={group.y + 30 - (lines.length - 1) * 8}
        dominantBaseline="central"
      >
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static lines can repeat and have no state
          <tspan key={`${index}-${line}`} x={group.x + 53} dy={index ? 16 : 0}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
