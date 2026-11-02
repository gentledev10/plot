import { shippingSimulation } from '@shared/simulation.fixture';
import { describe, expect, it } from 'vitest';
import { parseSimulations } from './simulation-schema';

const changes = new Set(['Shipping threshold']);
describe('parseSimulations', () => {
  it('keeps only bounded native function bindings, never expressions or unknown input references', () => {
    const raw = shippingSimulation();
    raw.binding = {
      before: {
        path: 'src/shipping.ts',
        exportName: 'shipping',
        args: [{ input: 'amount' }, { value: true }],
      },
      after: {
        path: 'src/shipping.ts',
        exportName: 'shipping',
        args: [{ input: 'amount' }, { value: true }],
      },
    };
    expect(parseSimulations([raw], changes)[0]?.binding).toEqual(raw.binding);
    for (const path of ['../private.mjs', '/tmp/private.mjs', 'src\\escape.mjs']) {
      raw.binding.after.path = path;
      expect(parseSimulations([raw], changes)[0]?.binding).toBeUndefined();
    }
    raw.binding.after.path = 'src/shipping.ts';
    raw.binding.after.args = [{ input: 'unknown' }];
    expect(parseSimulations([raw], changes)[0]?.binding).toBeUndefined();
  });
  it('preserves complete models, typed invalid-input cases and safe current-code locations', () => {
    const input = shippingSimulation();
    const amount = input.cases[0]?.inputs[0];
    if (amount) amount.value = 'not a number';
    const [parsed] = parseSimulations([input], changes);
    expect(parsed?.cases[0]?.inputs[0]?.value).toBe('not a number');
    expect(parsed?.before.nodes[0]).not.toHaveProperty('location');
    expect(parsed?.after.nodes[0]?.location).toEqual({ path: 'src/shipping.ts', line: 4 });
  });
  it('rejects unsupported operators, cycles, missing destinations and duplicate nodes as whole models', () => {
    for (const mutate of [
      (v: Record<string, unknown>) => {
        v.operator = 'eval';
      },
      (v: Record<string, unknown>) => {
        v.yes = 'authorized';
      },
      (v: Record<string, unknown>) => {
        v.no = 'missing';
      },
      (v: Record<string, unknown>) => {
        v.id = 'service';
      },
    ]) {
      const raw = structuredClone(shippingSimulation());
      mutate(raw.after.nodes[0] as unknown as Record<string, unknown>);
      expect(parseSimulations([raw], changes)).toEqual([]);
    }
  });
  it('rejects orphaned changes and partial/duplicate input sets without inventing defaults', () => {
    const raw = shippingSimulation();
    expect(parseSimulations([raw], new Set())).toEqual([]);
    raw.cases[0]?.inputs.pop();
    const duplicate = raw.cases[1]?.inputs[1];
    if (duplicate) duplicate.id = 'amount';
    expect(parseSimulations([raw], changes)[0]?.cases).toHaveLength(6);
  });
  it('bounds models and drops unsafe source paths', () => {
    const raw = shippingSimulation();
    const node = raw.after.nodes[0];
    if (node) node.location = { path: '../private', line: 2 };
    expect(parseSimulations([raw], changes)[0]?.after.nodes[0]).not.toHaveProperty('location');
    raw.after.nodes.push({ id: 'unreachable', label: 'Not connected', kind: 'return', value: 'x' });
    expect(parseSimulations([raw], changes)).toEqual([]);
    const large = shippingSimulation();
    large.inputs.push(...large.inputs);
    expect(parseSimulations([large], changes)).toEqual([]);
  });
});
