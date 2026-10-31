import type {
  ArchitectureEdge,
  ArchitectureNode,
  CodeLocation,
  Flow,
  FlowStep,
  ReadingStep,
  ReviewMap,
  Risk,
  RiskSeverity,
} from '@shared/review';
import { AppError } from '../errors';

const text = { type: 'string' } as const;

const location = {
  type: 'object',
  properties: { path: text, line: { type: 'integer' } },
  required: ['path', 'line'],
  additionalProperties: false,
} as const;

const optionalLocation = { anyOf: [location, { type: 'null' }] } as const;

// Strict enough for OpenAI structured outputs, which Codex uses: every property is required,
// optional values are nullable, and no object accepts properties it does not list.
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    readingOrder: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: text, reason: text },
        required: ['path', 'reason'],
        additionalProperties: false,
      },
    },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { from: text, to: text, label: text, location: optionalLocation },
              required: ['from', 'to', 'label', 'location'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'steps'],
        additionalProperties: false,
      },
    },
    architecture: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: text,
              label: text,
              changed: { type: 'boolean' },
              location: optionalLocation,
            },
            required: ['id', 'label', 'changed', 'location'],
            additionalProperties: false,
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: { from: text, to: text, label: { type: ['string', 'null'] } },
            required: ['from', 'to', 'label'],
            additionalProperties: false,
          },
        },
      },
      required: ['nodes', 'edges'],
      additionalProperties: false,
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          detail: text,
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          location: optionalLocation,
        },
        required: ['title', 'detail', 'severity', 'location'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'readingOrder', 'flows', 'architecture', 'risks'],
  additionalProperties: false,
} as const;

const LIMITS = {
  text: 2_000,
  label: 200,
  readingOrder: 300,
  flows: 5,
  steps: 40,
  nodes: 40,
  edges: 80,
  risks: 30,
};

type Json = Record<string, unknown>;

export function parseReviewMap(value: unknown): ReviewMap {
  if (!isObject(value) || typeof value.summary !== 'string') {
    throw new AppError('ai-invalid-output', 'The AI review did not have the expected shape.');
  }
  const architecture = isObject(value.architecture) ? value.architecture : {};
  const nodes = list(architecture.nodes, LIMITS.nodes, toNode);
  const ids = new Set(nodes.map((node) => node.id));
  return {
    summary: clip(value.summary, LIMITS.text),
    readingOrder: list(value.readingOrder, LIMITS.readingOrder, toReadingStep),
    flows: list(value.flows, LIMITS.flows, toFlow),
    architecture: {
      nodes,
      edges: list(architecture.edges, LIMITS.edges, toEdge).filter(
        (edge) => ids.has(edge.from) && ids.has(edge.to),
      ),
    },
    risks: list(value.risks, LIMITS.risks, toRisk),
  };
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
  const steps = list(item.steps, LIMITS.steps, toStep);
  return steps.length > 0 ? { title: clip(item.title, LIMITS.label), steps } : undefined;
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
  if (!nonEmpty(item.id) || typeof item.label !== 'string' || typeof item.changed !== 'boolean') {
    return undefined;
  }
  return withLocation(
    {
      id: clip(item.id, LIMITS.label),
      label: clip(item.label, LIMITS.label),
      changed: item.changed,
    },
    item.location,
  );
}

function toEdge(item: Json): ArchitectureEdge | undefined {
  if (!nonEmpty(item.from) || !nonEmpty(item.to)) {
    return undefined;
  }
  const edge: ArchitectureEdge = { from: item.from, to: item.to };
  if (typeof item.label === 'string' && item.label.trim() !== '') {
    edge.label = clip(item.label, LIMITS.label);
  }
  return edge;
}

function toRisk(item: Json): Risk | undefined {
  if (
    typeof item.title !== 'string' ||
    typeof item.detail !== 'string' ||
    !isSeverity(item.severity)
  ) {
    return undefined;
  }
  return withLocation(
    {
      title: clip(item.title, LIMITS.label),
      detail: clip(item.detail, LIMITS.text),
      severity: item.severity,
    },
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

function isSeverity(value: unknown): value is RiskSeverity {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
