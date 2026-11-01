import type { ChangeStatus, Flow, FlowStep, ReviewMap } from '@shared/review';
import type { ColorScheme } from '../../lib/color-scheme';

const MAX_LABEL = 60;

const STATUS_STYLE: Record<ColorScheme, Record<Exclude<ChangeStatus, 'unchanged'>, string>> = {
  light: {
    added: 'fill:#e3f2df,stroke:#208a3c,stroke-width:2px,color:#1e1f22',
    changed: 'fill:#d4e2ff,stroke:#3574f0,stroke-width:2px,color:#1e1f22',
    removed: 'fill:#f2f2f2,stroke:#a8adbd,stroke-width:2px,stroke-dasharray:4 3,color:#6c707e',
  },
  dark: {
    added: 'fill:#294436,stroke:#57965c,stroke-width:2px,color:#dfe1e5',
    changed: 'fill:#2e436e,stroke:#548af7,stroke-width:2px,color:#dfe1e5',
    removed: 'fill:#2b2d30,stroke:#6f737a,stroke-width:2px,stroke-dasharray:4 3,color:#868a91',
  },
};

const HIGHLIGHT = {
  added: 'rgba(95, 184, 101, 0.2)',
  removed: 'rgba(219, 92, 92, 0.18)',
} as const;

export type StepHighlight = keyof typeof HIGHLIGHT;

export function safeLabel(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N} ._\-()/,'=+*!?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = cleaned.length > MAX_LABEL ? `${cleaned.slice(0, MAX_LABEL - 1)}…` : cleaned;
  return clipped === '' ? '?' : clipped;
}

function stepKey(step: FlowStep): string {
  return [step.from, step.to, step.label]
    .map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase())
    .join('\u0000');
}

export interface FlowComparison {
  removed: ReadonlySet<number>;
  added: ReadonlySet<number>;
}

export function compareFlow(flow: Flow): FlowComparison {
  const beforeKeys = new Set(flow.before.map(stepKey));
  const afterKeys = new Set(flow.after.map(stepKey));
  const indexesNotIn = (steps: FlowStep[], other: ReadonlySet<string>) =>
    new Set(steps.flatMap((step, index) => (other.has(stepKey(step)) ? [] : [index])));
  return {
    removed: flow.after.length === 0 ? new Set() : indexesNotIn(flow.before, afterKeys),
    added: flow.before.length === 0 ? new Set() : indexesNotIn(flow.after, beforeKeys),
  };
}

export function sequenceToMermaid(
  steps: readonly FlowStep[],
  highlighted: ReadonlySet<number> = new Set(),
  highlight: StepHighlight = 'added',
): string {
  const ids = new Map<string, string>();
  const participant = (name: string) => {
    let id = ids.get(name);
    if (!id) {
      id = `p${ids.size}`;
      ids.set(name, id);
    }
    return id;
  };
  const messages = steps.flatMap((step, index) => {
    const message = `${participant(step.from)}->>${participant(step.to)}: ${safeLabel(step.label)}`;
    return highlighted.has(index)
      ? [`  rect ${HIGHLIGHT[highlight]}`, `    ${message}`, '  end']
      : [`  ${message}`];
  });
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
  direction: 'LR' | 'TD' = 'LR',
): ArchitectureDiagram {
  const nodeIds = architecture.nodes.map((node) => node.id);
  const idOf = (id: string) => `n${nodeIds.indexOf(id)}`;
  const nodes = architecture.nodes.map(
    (node, index) =>
      `  n${index}["${safeLabel(node.label)}"]${node.status === 'unchanged' ? '' : `:::${node.status}`}`,
  );
  const edges = architecture.edges.map((edge) => {
    const label = edge.label ? `|"${safeLabel(edge.label)}"|` : '';
    return `  ${idOf(edge.from)} -->${label} ${idOf(edge.to)}`;
  });
  const classes = Object.entries(STATUS_STYLE[scheme]).map(
    ([status, style]) => `  classDef ${status} ${style}`,
  );
  return { source: [`flowchart ${direction}`, ...nodes, ...edges, ...classes].join('\n'), nodeIds };
}

export function nodeIndexFromElementId(elementId: string): number | undefined {
  const match = /^flowchart-n(\d+)-\d+$/.exec(elementId);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
