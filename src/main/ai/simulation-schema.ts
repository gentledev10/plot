import type { CodeLocation } from '@shared/review';
import type { FunctionBinding, ScenarioBinding } from '@shared/review-execution';
import {
  type ReviewSimulation,
  SCENARIO_CATEGORIES,
  SCENARIO_OPERATORS,
  type ScenarioNode,
  type ScenarioOperator,
  type ScenarioProgram,
  type ScenarioValue,
} from '@shared/simulation';

const text = { type: 'string' } as const;
const scalar = {
  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
} as const;
const object = <T extends Record<string, unknown>>(properties: T) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const location = { anyOf: [object({ path: text, line: { type: 'integer' } }), { type: 'null' }] };
const base = { id: text, label: text, location };
const binding = object({
  path: text,
  exportName: text,
  args: { type: 'array', items: { anyOf: [object({ input: text }), object({ value: scalar })] } },
});
const program = object({
  entry: text,
  nodes: {
    type: 'array',
    items: {
      anyOf: [
        object({
          ...base,
          kind: { type: 'string', enum: ['condition'] },
          input: text,
          operator: { type: 'string', enum: SCENARIO_OPERATORS },
          value: scalar,
          yes: text,
          no: text,
        }),
        object({ ...base, kind: { type: 'string', enum: ['return', 'error'] }, value: scalar }),
      ],
    },
  },
});
export const SIMULATIONS_SCHEMA = {
  type: 'array',
  items: object({
    id: text,
    changeTitle: text,
    title: text,
    scope: text,
    binding: { anyOf: [object({ before: binding, after: binding }), { type: 'null' }] },
    inputs: {
      type: 'array',
      items: object({
        id: text,
        label: text,
        kind: { type: 'string', enum: ['number', 'text', 'boolean'] },
        default: scalar,
      }),
    },
    before: program,
    after: program,
    cases: {
      type: 'array',
      items: object({
        id: text,
        label: text,
        category: { type: 'string', enum: SCENARIO_CATEGORIES },
        question: text,
        inputs: { type: 'array', items: object({ id: text, value: scalar }) },
      }),
    },
  }),
};

type Json = Record<string, unknown>;
const record = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const label = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(v);
const value = (v: unknown): v is ScenarioValue =>
  v === null ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.length <= 300);

function codeLocation(v: unknown): CodeLocation | undefined {
  if (!record(v) || typeof v.path !== 'string' || !Number.isInteger(v.line) || Number(v.line) < 1)
    return;
  const path = v.path.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  if (!path || path.includes('\\') || path.split('/').includes('..')) return;
  return { path, line: Number(v.line) };
}

function parseProgram(
  raw: unknown,
  inputs: Set<string>,
  before: boolean,
): ScenarioProgram | undefined {
  if (
    !record(raw) ||
    !identifier(raw.entry) ||
    !Array.isArray(raw.nodes) ||
    raw.nodes.length < 1 ||
    raw.nodes.length > 14
  )
    return;
  const nodes: ScenarioNode[] = [];
  for (const item of raw.nodes) {
    if (!record(item) || !identifier(item.id) || !label(item.label) || !value(item.value)) return;
    const location = before ? undefined : codeLocation(item.location);
    const base = { id: item.id, label: item.label.trim(), ...(location ? { location } : {}) };
    if (item.kind === 'return' || item.kind === 'error') {
      nodes.push({ ...base, kind: item.kind, value: item.value });
    } else if (
      item.kind === 'condition' &&
      typeof item.input === 'string' &&
      inputs.has(item.input) &&
      SCENARIO_OPERATORS.includes(item.operator as ScenarioOperator) &&
      identifier(item.yes) &&
      identifier(item.no)
    ) {
      // Ordered comparisons are numeric; contains is a string operation. Never coerce values.
      if (
        ['gt', 'gte', 'lt', 'lte'].includes(String(item.operator)) &&
        typeof item.value !== 'number'
      )
        return;
      if (item.operator === 'contains' && typeof item.value !== 'string') return;
      nodes.push({
        ...base,
        kind: 'condition',
        input: item.input,
        operator: item.operator as ScenarioOperator,
        value: item.value,
        yes: item.yes,
        no: item.no,
      });
    } else return;
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length || !byId.has(raw.entry)) return;
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const node = byId.get(id);
    if (!node) return false;
    visiting.add(id);
    if (node.kind === 'condition' && (!visit(node.yes) || !visit(node.no))) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (!visit(raw.entry) || visited.size !== nodes.length) return;
  return { entry: raw.entry, nodes };
}

export function parseSimulations(raw: unknown, changes: ReadonlySet<string>): ReviewSimulation[] {
  if (!Array.isArray(raw)) return [];
  const result: ReviewSimulation[] = [];
  for (const item of raw.slice(0, 6)) {
    if (
      !record(item) ||
      !identifier(item.id) ||
      !label(item.title) ||
      !label(item.changeTitle) ||
      !changes.has(item.changeTitle.trim()) ||
      typeof item.scope !== 'string' ||
      !item.scope.trim() ||
      !Array.isArray(item.inputs) ||
      item.inputs.length < 1 ||
      item.inputs.length > 4 ||
      !Array.isArray(item.cases) ||
      item.cases.length < 1 ||
      item.cases.length > 8 ||
      result.some((other) => other.id === item.id)
    )
      continue;
    const inputs: ReviewSimulation['inputs'] = [];
    for (const input of item.inputs) {
      if (
        !record(input) ||
        !identifier(input.id) ||
        !label(input.label) ||
        !['number', 'text', 'boolean'].includes(String(input.kind)) ||
        !value(input.default)
      )
        break;
      inputs.push({
        id: input.id,
        label: input.label.trim(),
        kind: input.kind as 'number' | 'text' | 'boolean',
        default: input.default,
      });
    }
    const ids = new Set(inputs.map((input) => input.id));
    if (inputs.length !== item.inputs.length || ids.size !== inputs.length) continue;
    const before = parseProgram(item.before, ids, true);
    const after = parseProgram(item.after, ids, false);
    if (!before || !after) continue;
    const cases: ReviewSimulation['cases'] = [];
    for (const scenario of item.cases) {
      if (
        !record(scenario) ||
        !identifier(scenario.id) ||
        ['default', 'custom'].includes(scenario.id) ||
        !label(scenario.label) ||
        !SCENARIO_CATEGORIES.includes(scenario.category as never) ||
        typeof scenario.question !== 'string' ||
        !Array.isArray(scenario.inputs) ||
        scenario.inputs.length !== inputs.length ||
        cases.some((other) => other.id === scenario.id)
      )
        continue;
      const values: { id: string; value: ScenarioValue }[] = [];
      for (const input of scenario.inputs) {
        if (
          !record(input) ||
          typeof input.id !== 'string' ||
          !ids.has(input.id) ||
          !value(input.value)
        )
          break;
        values.push({ id: input.id, value: input.value });
      }
      if (
        values.length !== inputs.length ||
        new Set(values.map((v) => v.id)).size !== inputs.length
      )
        continue;
      cases.push({
        id: scenario.id,
        label: scenario.label.trim(),
        category: scenario.category as ReviewSimulation['cases'][number]['category'],
        question: scenario.question.trim().slice(0, 800),
        inputs: values,
      });
    }
    if (!cases.length) continue;
    result.push({
      id: item.id,
      changeTitle: item.changeTitle.trim(),
      title: item.title.trim(),
      scope: item.scope.trim().slice(0, 1600),
      ...(parseBinding(item.binding, ids) ? { binding: parseBinding(item.binding, ids) } : {}),
      inputs,
      before,
      after,
      cases,
    });
    if (result.length === 2) break;
  }
  return result;
}

function parseBinding(raw: unknown, inputs: Set<string>): ScenarioBinding | undefined {
  if (!record(raw)) return;
  const parse = (v: unknown): FunctionBinding | undefined => {
    if (
      !record(v) ||
      typeof v.path !== 'string' ||
      !/\.(mjs|cjs|js|ts)$/.test(v.path) ||
      v.path.startsWith('/') ||
      v.path.includes('\\') ||
      v.path.includes('\0') ||
      v.path.split('/').some((p) => !p || p === '..' || p === '.') ||
      typeof v.exportName !== 'string' ||
      !/^[a-zA-Z_$][\w$]{0,127}$/.test(v.exportName) ||
      !Array.isArray(v.args) ||
      v.args.length > 8
    )
      return;
    const args: FunctionBinding['args'] = [];
    for (const arg of v.args) {
      if (!record(arg)) return;
      if (typeof arg.input === 'string' && inputs.has(arg.input) && !('value' in arg))
        args.push({ input: arg.input });
      else if (value(arg.value) && !('input' in arg)) args.push({ value: arg.value });
      else return;
    }
    return { path: v.path, exportName: v.exportName, args };
  };
  const before = parse(raw.before);
  const after = parse(raw.after);
  return before && after ? { before, after } : undefined;
}
