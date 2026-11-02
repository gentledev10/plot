import { FLOW_ROLES, type FlowRole } from '@shared/flowchart';
import type {
  Architecture,
  ArchitectureEdge,
  ArchitectureNode,
  ChangeStatus,
  CodeLocation,
  CustomReviewSection,
  Flow,
  FlowStep,
  Impact,
  KeyChange,
  ReadingStep,
  ReviewMap,
  ReviewPoint,
  ReviewVisual,
} from '@shared/review';
import { isCustomStepId } from '@shared/review-plan';
import { AppError } from '../errors';
import { linkReviewUnits, parseReviewUnits, REVIEW_UNITS_SCHEMA } from './review-unit-schema';
import { parseSimulations, SIMULATIONS_SCHEMA } from './simulation-schema';

const text = { type: 'string' } as const;

const location = {
  type: 'object',
  properties: { path: text, line: { type: 'integer' } },
  required: ['path', 'line'],
  additionalProperties: false,
} as const;

const optionalLocation = { anyOf: [location, { type: 'null' }] } as const;

const step = {
  type: 'object',
  properties: { from: text, to: text, label: text, location: optionalLocation },
  required: ['from', 'to', 'label', 'location'],
  additionalProperties: false,
} as const;

const architectureSchema = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: text, label: text },
        required: ['id', 'label'],
        additionalProperties: false,
      },
    },
    summary: text,
    scope: text,
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: text,
          label: text,
          flowRole: { anyOf: [{ type: 'string', enum: FLOW_ROLES }, { type: 'null' }] },
          status: { type: 'string', enum: ['added', 'changed', 'removed', 'unchanged'] },
          group: { type: ['string', 'null'] },
          evidence: { type: 'string', enum: ['code', 'docs', 'inferred'] },
          location: optionalLocation,
        },
        required: ['id', 'label', 'flowRole', 'status', 'group', 'evidence', 'location'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: text,
          to: text,
          label: { type: ['string', 'null'] },
          evidence: { type: 'string', enum: ['code', 'docs', 'inferred'] },
        },
        required: ['from', 'to', 'label', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups', 'summary', 'scope', 'nodes', 'edges'],
  additionalProperties: false,
} as const;

const visualGraphSchema = {
  type: 'object',
  properties: {
    groups: architectureSchema.properties.groups,
    nodes: architectureSchema.properties.nodes,
    edges: architectureSchema.properties.edges,
  },
  required: ['groups', 'nodes', 'edges'],
  additionalProperties: false,
} as const;

// Strict enough for OpenAI structured outputs, which Codex uses: every property is required,
// optional values are nullable, and no object accepts properties it does not list.
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    units: REVIEW_UNITS_SCHEMA,
    simulations: SIMULATIONS_SCHEMA,
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: text, before: text, after: text, location: optionalLocation },
        required: ['title', 'before', 'after', 'location'],
        additionalProperties: false,
      },
    },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          before: { type: 'array', items: step },
          after: { type: 'array', items: step },
        },
        required: ['title', 'before', 'after'],
        additionalProperties: false,
      },
    },
    architecture: architectureSchema,
    visuals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['components', 'flowchart', 'sequence'] },
          title: text,
          takeaway: text,
          scope: text,
          before: { anyOf: [visualGraphSchema, { type: 'null' }] },
          after: { anyOf: [visualGraphSchema, { type: 'null' }] },
        },
        required: ['kind', 'title', 'takeaway', 'scope', 'before', 'after'],
        additionalProperties: false,
      },
    },
    reviewPoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          reason: text,
          check: text,
          evidence: { type: 'string', enum: ['code', 'description', 'inferred'] },
          location: optionalLocation,
        },
        required: ['title', 'reason', 'check', 'evidence', 'location'],
        additionalProperties: false,
      },
    },
    impacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: text, detail: text, location: optionalLocation },
        required: ['area', 'detail', 'location'],
        additionalProperties: false,
      },
    },
    customSections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: text,
          body: text,
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { area: text, detail: text, location: optionalLocation },
              required: ['area', 'detail', 'location'],
              additionalProperties: false,
            },
          },
          diagram: {
            anyOf: [
              {
                ...architectureSchema,
                properties: {
                  ...architectureSchema.properties,
                  kind: { type: 'string', enum: ['components', 'flowchart', 'sequence'] },
                },
                required: [...architectureSchema.required, 'kind'],
              },
              { type: 'null' },
            ],
          },
        },
        required: ['id', 'body', 'items', 'diagram'],
        additionalProperties: false,
      },
    },
    readingOrder: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: text, reason: text },
        required: ['path', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'summary',
    'changes',
    'flows',
    'architecture',
    'visuals',
    'impacts',
    'readingOrder',
    'customSections',
    'reviewPoints',
    'simulations',
    'units',
  ],
  additionalProperties: false,
} as const;

const LIMITS = {
  text: 2_000,
  label: 200,
  changes: 15,
  flows: 4,
  steps: 30,
  nodes: 40,
  edges: 80,
  impacts: 15,
  readingOrder: 300,
};

const STATUSES: ReadonlySet<ChangeStatus> = new Set(['added', 'changed', 'removed', 'unchanged']);

type Json = Record<string, unknown>;

export function parseReviewMap(value: unknown): ReviewMap {
  if (!isObject(value) || typeof value.summary !== 'string') {
    throw new AppError('ai-invalid-output', 'The AI overview did not have the expected shape.');
  }
  const changes = list(value.changes, LIMITS.changes, toKeyChange);
  return linkReviewUnits({
    summary: clip(value.summary, LIMITS.text),
    ...(Array.isArray(value.units) ? { units: parseReviewUnits(value.units) } : {}),
    changes,
    ...(Array.isArray(value.simulations)
      ? {
          simulations: parseSimulations(
            value.simulations,
            new Set(changes.map((change) => change.title)),
          ),
        }
      : {}),
    flows: list(value.flows, LIMITS.flows, toFlow),
    architecture: toArchitecture(value.architecture),
    ...(Array.isArray(value.visuals)
      ? {
          visuals: list(value.visuals, 3, toVisual).filter(
            (visual, index, all) =>
              all.findIndex(
                (other) => other.kind === visual.kind && other.title === visual.title,
              ) === index,
          ),
        }
      : {}),
    impacts: list(value.impacts, LIMITS.impacts, toImpact),
    ...(Array.isArray(value.reviewPoints)
      ? { reviewPoints: list(value.reviewPoints, 8, toReviewPoint) }
      : {}),
    readingOrder: list(value.readingOrder, LIMITS.readingOrder, toReadingStep),
    ...(Array.isArray(value.customSections)
      ? {
          customSections: list(value.customSections, 6, toCustom).filter(
            (item, index, all) => all.findIndex((other) => other.id === item.id) === index,
          ),
        }
      : {}),
  });
}

function toVisual(item: Json): ReviewVisual | undefined {
  if (
    !['components', 'flowchart', 'sequence'].includes(String(item.kind)) ||
    !nonEmpty(item.title) ||
    !nonEmpty(item.takeaway)
  )
    return;
  const graph = (value: unknown, before: boolean) => {
    if (!isObject(value)) return;
    const parsed = toArchitecture(value);
    const nodes = parsed.nodes.slice(0, 12).map((node) => {
      if (!before) return node;
      const { location: _, ...rest } = node;
      return rest;
    });
    const ids = new Set(nodes.map((node) => node.id));
    return nodes.length
      ? {
          ...parsed,
          nodes,
          edges: parsed.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).slice(0, 24),
        }
      : undefined;
  };
  const before = graph(item.before, true);
  const after = graph(item.after, false);
  if (!before && !after) return;
  return {
    kind: item.kind as ReviewVisual['kind'],
    title: clip(item.title, LIMITS.label),
    takeaway: clip(item.takeaway, 600),
    scope: typeof item.scope === 'string' ? clip(item.scope, LIMITS.text) : '',
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

function toArchitecture(value: unknown): Architecture {
  const graph = isObject(value) ? value : {};
  const groups = list(graph.groups, 8, (group) =>
    nonEmpty(group.id) && nonEmpty(group.label)
      ? { id: clip(group.id, LIMITS.label), label: clip(group.label, LIMITS.label) }
      : undefined,
  ).filter((group, index, all) => all.findIndex((other) => other.id === group.id) === index);
  const groupIds = new Set(groups.map((group) => group.id));
  const nodes = list(graph.nodes, LIMITS.nodes, toNode).filter(
    (node, index, all) => all.findIndex((other) => other.id === node.id) === index,
  );
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...(Array.isArray(graph.groups) ? { groups } : {}),
    ...(graph.grouping === 'source-files' ? { grouping: 'source-files' as const } : {}),
    ...(typeof graph.summary === 'string' ? { summary: clip(graph.summary, LIMITS.text) } : {}),
    ...(typeof graph.scope === 'string' ? { scope: clip(graph.scope, LIMITS.text) } : {}),
    nodes: nodes.map((node) => {
      if (node.group && !groupIds.has(node.group)) {
        const { group: _, ...rest } = node;
        return rest;
      }
      return node;
    }),
    edges: list(graph.edges, LIMITS.edges, toEdge).filter(
      (edge) => ids.has(edge.from) && ids.has(edge.to),
    ),
  };
}

function toCustom(item: Json): CustomReviewSection | undefined {
  if (typeof item.id !== 'string' || !isCustomStepId(item.id) || typeof item.body !== 'string')
    return undefined;
  return {
    id: item.id,
    body: clip(item.body, 6000),
    items: list(item.items, LIMITS.impacts, toImpact),
    ...(isObject(item.diagram)
      ? {
          diagram: {
            ...toArchitecture(item.diagram),
            ...(['components', 'flowchart', 'sequence'].includes(String(item.diagram.kind))
              ? { kind: item.diagram.kind as 'components' | 'flowchart' | 'sequence' }
              : {}),
          },
        }
      : {}),
  };
}

function toKeyChange(item: Json): KeyChange | undefined {
  if (!nonEmpty(item.title) || typeof item.before !== 'string' || typeof item.after !== 'string') {
    return undefined;
  }
  if (item.before.trim() === '' && item.after.trim() === '') {
    return undefined;
  }
  return withLocation(
    {
      title: clip(item.title, LIMITS.label),
      before: clip(item.before, LIMITS.text),
      after: clip(item.after, LIMITS.text),
    },
    item.location,
  );
}

function toReadingStep(item: Json): ReadingStep | undefined {
  const path = filePath(item.path);
  return path && typeof item.reason === 'string'
    ? { path, reason: clip(item.reason, LIMITS.text) }
    : undefined;
}

function toFlow(item: Json): Flow | undefined {
  if (typeof item.title !== 'string') {
    return undefined;
  }
  // Steps before the change describe code that may no longer exist, so they keep no location.
  const before = list(item.before, LIMITS.steps, toStep).map(({ location: _, ...rest }) => rest);
  const after = list(item.after, LIMITS.steps, toStep);
  return before.length > 0 || after.length > 0
    ? { title: clip(item.title, LIMITS.label), before, after }
    : undefined;
}

function toStep(item: Json): FlowStep | undefined {
  if (!nonEmpty(item.from) || !nonEmpty(item.to) || typeof item.label !== 'string') {
    return undefined;
  }
  return withLocation(
    {
      from: clip(item.from, LIMITS.label),
      to: clip(item.to, LIMITS.label),
      label: clip(item.label, LIMITS.label),
    },
    item.location,
  );
}

function toNode(item: Json): ArchitectureNode | undefined {
  if (
    !nonEmpty(item.id) ||
    typeof item.label !== 'string' ||
    !STATUSES.has(item.status as ChangeStatus)
  ) {
    return undefined;
  }
  return withLocation(
    {
      id: clip(item.id, LIMITS.label),
      label: clip(item.label, LIMITS.label),
      ...(FLOW_ROLES.includes(item.flowRole as FlowRole)
        ? { flowRole: item.flowRole as FlowRole }
        : {}),
      status: item.status as ChangeStatus,
      ...(nonEmpty(item.group) ? { group: clip(item.group, LIMITS.label) } : {}),
      ...(['code', 'docs', 'inferred'].includes(String(item.evidence))
        ? { evidence: item.evidence as ArchitectureNode['evidence'] }
        : {}),
    },
    item.location,
  );
}

function toEdge(item: Json): ArchitectureEdge | undefined {
  if (!nonEmpty(item.from) || !nonEmpty(item.to)) {
    return undefined;
  }
  const edge: ArchitectureEdge = { from: item.from, to: item.to };
  if (['code', 'docs', 'inferred'].includes(String(item.evidence)))
    edge.evidence = item.evidence as ArchitectureEdge['evidence'];
  if (typeof item.label === 'string' && item.label.trim() !== '') {
    edge.label = clip(item.label, LIMITS.label);
  }
  return edge;
}

function toReviewPoint(item: Json): ReviewPoint | undefined {
  if (!nonEmpty(item.title) || !nonEmpty(item.reason) || !nonEmpty(item.check)) return undefined;
  return withLocation(
    {
      title: clip(item.title, LIMITS.label),
      reason: clip(item.reason, LIMITS.text),
      check: clip(item.check, LIMITS.text),
      evidence: ['code', 'description', 'inferred'].includes(String(item.evidence))
        ? (item.evidence as ReviewPoint['evidence'])
        : 'inferred',
    },
    item.location,
  );
}

function toImpact(item: Json): Impact | undefined {
  if (!nonEmpty(item.area) || typeof item.detail !== 'string') {
    return undefined;
  }
  return withLocation(
    { area: clip(item.area, LIMITS.label), detail: clip(item.detail, LIMITS.text) },
    item.location,
  );
}

function withLocation<T extends object>(
  target: T,
  value: unknown,
): T & { location?: CodeLocation } {
  if (!isObject(value)) {
    return target;
  }
  const path = filePath(value.path);
  const line = value.line;
  if (!path || typeof line !== 'number' || !Number.isInteger(line) || line < 1) {
    return target;
  }
  return { ...target, location: { path, line } };
}

function filePath(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const path = value.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  return path === '' || path.split('/').includes('..') ? undefined : path;
}

function list<T>(value: unknown, limit: number, map: (item: Json) => T | undefined): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isObject)
    .map(map)
    .filter((item): item is T => item !== undefined)
    .slice(0, limit);
}

function clip(value: string, length: number): string {
  const trimmed = value.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length - 1)}…` : trimmed;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
