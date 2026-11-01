import type { Architecture } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { nodeRole, roundedConnection } from './diagram-design';
import { layoutSequence } from './sequence-layout';

const graph: Architecture = {
  nodes: [
    { id: 'caller', label: '앱 호출자', status: 'unchanged' },
    { id: 'worker', label: 'ModuleRunner', status: 'changed' },
  ],
  edges: [
    { from: 'caller', to: 'worker', label: 'evaluate' },
    { from: 'worker', to: 'worker', label: 'cache result' },
    { from: 'worker', to: 'caller', label: 'return result' },
  ],
};

describe('sequence layout', () => {
  it('preserves call order, return direction and self calls', () => {
    const result = layoutSequence(graph);
    expect(result.messages.map((message) => message.index)).toEqual([0, 1, 2]);
    expect(result.messages.map((message) => message.y)).toEqual(
      [...result.messages.map((message) => message.y)].sort((a, b) => a - b),
    );
    const [call, self, returned] = result.messages;
    expect(call?.from.center).toBeLessThan(call?.to.center ?? 0);
    expect(self?.self).toBe(true);
    expect(self?.path).toContain('q');
    expect(returned?.from.center).toBeGreaterThan(returned?.to.center ?? 0);
    expect(result.height).toBeGreaterThan((returned?.y ?? 0) + 20);
  });
  it('retains participants that have no message and skips broken references', () => {
    const result = layoutSequence({
      ...graph,
      nodes: [...graph.nodes, { id: 'observer', label: 'Observer', status: 'unchanged' }],
      edges: [...graph.edges, { from: 'missing', to: 'worker' }],
    });
    expect(result.participants).toHaveLength(3);
    expect(result.messages).toHaveLength(3);
  });
  it.each(['Yes', '예', '없음: 반환'])(
    'recognizes branch labels in either language: %s',
    (label) => {
      const branch = {
        ...graph,
        edges: [
          { from: 'caller', to: 'worker', label },
          { from: 'caller', to: 'caller', label: 'other' },
        ],
      };
      expect(nodeRole(branch, 0, true)).toBe('decision');
      expect(nodeRole(branch, 0, false)).toBe('app');
    },
  );
  it('rounds elbows while retaining the actual connection endpoints', () => {
    expect(
      roundedConnection([
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 60, y: 40 },
      ]),
    ).toBe('M0,0 L0,28 Q0,40 12,40 L60,40');
  });
});
