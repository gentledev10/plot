import type { Architecture, CodeLocation } from '@shared/review';
import { useState } from 'react';
import { DiagramCanvas } from './DiagramCanvas';
import { DiagramGlyph } from './DiagramGlyph';
import { layoutSequence } from './sequence-layout';
import styles from './VisualWalkthrough.module.css';

export function SequenceDiagram({
  graph,
  label,
  onOpen,
  changedPaths,
}: {
  graph: Architecture;
  label: string;
  onOpen?(location: CodeLocation): void;
  changedPaths: ReadonlySet<string>;
}) {
  const [active, setActive] = useState<number>();
  const layout = layoutSequence(graph);
  const selected = layout.messages.find((message) => message.index === active);
  return (
    <DiagramCanvas width={layout.width} height={layout.height} label={label} kind="sequence">
      {(id) => (
        <>
          {layout.participants.map((participant) => (
            <g key={participant.id} data-palette={participant.palette}>
              <rect
                className={styles.lane}
                x={participant.x}
                y="28"
                width={participant.width}
                height={layout.height - 48}
                rx="18"
              />
              <path
                className={styles.lifeline}
                d={`M${participant.center},${28 + layout.headerHeight} V${layout.height - 32}`}
              />
            </g>
          ))}
          {layout.messages.map((message) => {
            const edge = graph.edges[message.index];
            return (
              <g
                key={message.index}
                className={styles.sequenceMessage}
                data-palette={message.from.palette}
                data-active={active === message.index}
                data-dimmed={active !== undefined && active !== message.index}
                data-inferred={edge?.evidence === 'inferred'}
                onPointerEnter={() => setActive(message.index)}
                onPointerLeave={() => setActive(undefined)}
              >
                <title>{`${message.index + 1}. ${edge?.label ?? ''}`}</title>
                <rect
                  className={styles.activation}
                  x={message.to.center - 6}
                  y={message.y - 10}
                  width="12"
                  height={message.self ? 44 : 24}
                  rx="4"
                />
                <path className={styles.wireHalo} d={message.path} />
                <path className={styles.wire} d={message.path} markerEnd={`url(#${id}-arrow)`} />
                <rect
                  className={styles.edgeCaption}
                  x={message.labelX - message.captionWidth / 2}
                  y={message.labelY}
                  width={message.captionWidth}
                  height={message.captionHeight}
                  rx="8"
                />
                <text
                  className={styles.edgeText}
                  x={message.labelX}
                  y={message.labelY + 17}
                  textAnchor="middle"
                >
                  {message.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable text fragments can repeat
                    <tspan key={`${index}-${line}`} x={message.labelX} dy={index ? 18 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <circle
                  className={styles.messageNumber}
                  cx={message.numberX}
                  cy={message.y}
                  r="11"
                />
                <text className={styles.messageIndex} x={message.numberX} y={message.y}>
                  {message.index + 1}
                </text>
              </g>
            );
          })}
          {layout.participants.map((participant) => {
            const source = graph.nodes[participant.index];
            const location = source?.location;
            const open =
              location && onOpen && changedPaths.has(location.path)
                ? () => onOpen(location)
                : undefined;
            const textX = participant.x + 57;
            const textY = 28 + layout.headerHeight / 2 - (participant.lines.length - 1) * 9.5;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: only verified current-code participants receive button semantics
              <g
                key={participant.id}
                className={styles.node}
                data-palette={participant.palette}
                data-status={source?.status}
                data-inferred={source?.evidence === 'inferred'}
                data-dimmed={
                  selected !== undefined &&
                  selected.from.id !== participant.id &&
                  selected.to.id !== participant.id
                }
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
                  className={styles.nodeBody}
                  x={participant.x}
                  y="28"
                  width={participant.width}
                  height={layout.headerHeight}
                  rx="16"
                  filter={`url(#${id}-shadow)`}
                />
                <rect
                  className={styles.nodeIcon}
                  x={participant.x + 12}
                  y={28 + layout.headerHeight / 2 - 17}
                  width="34"
                  height="34"
                  rx="10"
                />
                <g className={styles.glyph}>
                  <DiagramGlyph
                    role={participant.role}
                    x={participant.x + 19}
                    y={28 + layout.headerHeight / 2 - 10}
                    size={20}
                  />
                </g>
                <text className={styles.nodeText} x={textX} y={textY} dominantBaseline="central">
                  {participant.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable text fragments can repeat
                    <tspan key={`${index}-${line}`} x={textX} dy={index ? 19 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </>
      )}
    </DiagramCanvas>
  );
}
