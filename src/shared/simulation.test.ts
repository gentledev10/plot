import { describe, expect, it } from 'vitest';
import { evaluateScenario, scenarioCoverage, scenarioDefaults } from './simulation';
import { shippingSimulation } from './simulation.fixture';

describe('behavior explanation models', () => {
  const simulation = shippingSimulation();
  const run = (amount: string | number | null, side: 'before' | 'after' = 'after') => {
    const inputs = scenarioDefaults(simulation);
    inputs.set('amount', amount);
    return evaluateScenario(simulation[side], inputs);
  };
  it('compares actual boundary paths without an AI call or numeric coercion', () => {
    expect(run(29999).outcome?.value).toBe(3000);
    expect(run(30000).outcome?.value).toBe(0);
    expect(run(30000, 'before').outcome?.value).toBe(3000);
    expect(run(50000, 'before').outcome?.value).toBe(0);
    expect(run('30000').outcome).toMatchObject({ kind: 'error', value: 400 });
    expect(run(null).outcome).toMatchObject({ kind: 'error', value: 400 });
    expect(run(-1).outcome).toMatchObject({ kind: 'error', value: 400 });
  });
  it('shows the first relevant failure, including its branch values', () => {
    const inputs = scenarioDefaults(simulation);
    inputs.set('serviceOk', false);
    const failed = evaluateScenario(simulation.after, inputs);
    expect(failed.outcome?.value).toBe(503);
    expect(failed.nodes.map((node) => node.id)).toEqual(['authorized', 'service', 'unavailable']);
    expect(failed.nodes[1]).toMatchObject({ branch: false, input: false });
    inputs.set('authorized', false);
    expect(evaluateScenario(simulation.after, inputs).outcome?.value).toBe(403);
  });
  it('reports gaps in model branch exploration without calling it code coverage', () => {
    expect(scenarioCoverage(simulation, 'after')).toEqual({ covered: 10, total: 10 });
    expect(
      scenarioCoverage({ ...simulation, cases: simulation.cases.slice(0, 1) }, 'after'),
    ).toEqual({ covered: 5, total: 10 });
  });
  it('stops for missing inputs, disconnected references and cycles', () => {
    expect(evaluateScenario(simulation.after, new Map()).incomplete).toBe(true);
    const loop = {
      entry: 'loop',
      nodes: [
        {
          id: 'loop',
          label: 'Loop',
          kind: 'condition' as const,
          input: 'x',
          operator: 'eq' as const,
          value: 1,
          yes: 'loop',
          no: 'missing',
        },
      ],
    };
    expect(evaluateScenario(loop, new Map([['x', 1]]))).toEqual({
      nodes: [{ id: 'loop', branch: true, input: 1 }],
      incomplete: true,
    });
  });
});
