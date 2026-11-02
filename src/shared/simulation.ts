import type { CodeLocation } from './review';
import type { ScenarioBinding } from './review-execution';

export type ScenarioValue = string | number | boolean | null;
export const SCENARIO_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'is-number',
  'is-empty',
  'truthy',
  'contains',
] as const;
export type ScenarioOperator = (typeof SCENARIO_OPERATORS)[number];
export const SCENARIO_CATEGORIES = [
  'normal',
  'boundary',
  'invalid-input',
  'dependency-failure',
  'permission',
  'state',
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export interface ScenarioInput {
  id: string;
  label: string;
  kind: 'number' | 'text' | 'boolean';
  default: ScenarioValue;
}

interface ScenarioNodeBase {
  id: string;
  label: string;
  location?: CodeLocation;
}
export type ScenarioNode =
  | (ScenarioNodeBase & {
      kind: 'condition';
      input: string;
      operator: ScenarioOperator;
      value: ScenarioValue;
      yes: string;
      no: string;
    })
  | (ScenarioNodeBase & { kind: 'return' | 'error'; value: ScenarioValue });

export interface ScenarioProgram {
  entry: string;
  nodes: ScenarioNode[];
}

export interface ReviewSimulation {
  binding?: ScenarioBinding;
  id: string;
  changeTitle: string;
  title: string;
  scope: string;
  inputs: ScenarioInput[];
  before: ScenarioProgram;
  after: ScenarioProgram;
  cases: {
    id: string;
    label: string;
    category: ScenarioCategory;
    question: string;
    inputs: { id: string; value: ScenarioValue }[];
  }[];
}

export interface ScenarioTrace {
  nodes: { id: string; branch?: boolean; input?: ScenarioValue }[];
  outcome?: { kind: 'return' | 'error'; label: string; value: ScenarioValue };
  incomplete: boolean;
}

// This evaluates a small explanation model, never repository code or AI-produced scripts.
// Strict comparisons keep null, empty strings, numeric strings and numbers distinct.
export function evaluateScenario(
  program: ScenarioProgram,
  inputs: ReadonlyMap<string, ScenarioValue>,
): ScenarioTrace {
  const nodes = new Map(program.nodes.map((node) => [node.id, node]));
  const trace: ScenarioTrace['nodes'] = [];
  const visited = new Set<string>();
  let id = program.entry;
  while (trace.length < 24 && !visited.has(id)) {
    visited.add(id);
    const node = nodes.get(id);
    if (!node) break;
    if (node.kind !== 'condition') {
      trace.push({ id });
      return {
        nodes: trace,
        outcome: { kind: node.kind, label: node.label, value: node.value },
        incomplete: false,
      };
    }
    if (!inputs.has(node.input)) break;
    const input = inputs.get(node.input) ?? null;
    const branch = compare(input, node.operator, node.value);
    trace.push({ id, branch, input });
    if (branch === undefined) break;
    id = branch ? node.yes : node.no;
  }
  return { nodes: trace, incomplete: true };
}

function compare(
  left: ScenarioValue,
  operator: ScenarioOperator,
  right: ScenarioValue,
): boolean | undefined {
  switch (operator) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'is-number':
      return typeof left === 'number' && Number.isFinite(left);
    case 'is-empty':
      return left === null || left === '';
    case 'truthy':
      return Boolean(left);
    case 'contains':
      return typeof left === 'string' && typeof right === 'string'
        ? left.includes(right)
        : undefined;
    case 'gt':
      return typeof left === 'number' && typeof right === 'number' ? left > right : undefined;
    case 'gte':
      return typeof left === 'number' && typeof right === 'number' ? left >= right : undefined;
    case 'lt':
      return typeof left === 'number' && typeof right === 'number' ? left < right : undefined;
    case 'lte':
      return typeof left === 'number' && typeof right === 'number' ? left <= right : undefined;
  }
}

export function scenarioDefaults(simulation: ReviewSimulation): Map<string, ScenarioValue> {
  return new Map(simulation.inputs.map((input) => [input.id, input.default]));
}

export function scenarioCoverage(simulation: ReviewSimulation, side: 'before' | 'after') {
  const branches = new Set<string>();
  for (const scenario of simulation.cases) {
    const trace = evaluateScenario(
      simulation[side],
      new Map(scenario.inputs.map((v) => [v.id, v.value])),
    );
    for (const node of trace.nodes) {
      if (node.branch !== undefined) branches.add(`${node.id}:${node.branch}`);
    }
  }
  return {
    covered: branches.size,
    total: simulation[side].nodes.filter((node) => node.kind === 'condition').length * 2,
  };
}
