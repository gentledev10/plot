import type { Flow, ReviewMap } from '@shared/review';
import type { ColorScheme } from '../../lib/color-scheme';

const MAX_LABEL = 60;

const CHANGED_STYLE: Record<ColorScheme, string> = {
  light: 'fill:#d4e2ff,stroke:#3574f0,stroke-width:2px,color:#1e1f22',
  dark: 'fill:#2e436e,stroke:#548af7,stroke-width:2px,color:#dfe1e5',
};

export function safeLabel(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N} ._\-()/,'=+*!?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = cleaned.length > MAX_LABEL ? `${cleaned.slice(0, MAX_LABEL - 1)}…` : cleaned;
  return clipped === '' ? '?' : clipped;
}

export function flowToMermaid(flow: Flow): string {
  const ids = new Map<string, string>();
  const participant = (name: string) => {
    let id = ids.get(name);
    if (!id) {
      id = `p${ids.size}`;
      ids.set(name, id);
    }
    return id;
  };
  const messages = flow.steps.map(
    (step) => `  ${participant(step.from)}->>${participant(step.to)}: ${safeLabel(step.label)}`,
  );
  const participants = [...ids].map(([name, id]) => `  participant ${id} as ${safeLabel(name)}`);
  return ['sequenceDiagram', ...participants, ...messages].join('\n');
}

export interface ArchitectureDiagram {
  source: string;
  nodeIds: string[];
}

export function architectureToMermaid(
  architecture: ReviewMap['architecture'],
  scheme: ColorScheme,
): ArchitectureDiagram {
  const nodeIds = architecture.nodes.map((node) => node.id);
  const idOf = (id: string) => `n${nodeIds.indexOf(id)}`;
  const nodes = architecture.nodes.map(
    (node, index) => `  n${index}["${safeLabel(node.label)}"]${node.changed ? ':::changed' : ''}`,
  );
  const edges = architecture.edges.map((edge) => {
    const label = edge.label ? `|"${safeLabel(edge.label)}"|` : '';
    return `  ${idOf(edge.from)} -->${label} ${idOf(edge.to)}`;
  });
  return {
    source: [
      'flowchart LR',
      ...nodes,
      ...edges,
      `  classDef changed ${CHANGED_STYLE[scheme]}`,
    ].join('\n'),
    nodeIds,
  };
}

export function nodeIndexFromElementId(elementId: string): number | undefined {
  const match = /^flowchart-n(\d+)-\d+$/.exec(elementId);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
