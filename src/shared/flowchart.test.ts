import { describe, expect, it } from 'vitest';
import { flowRole } from './flowchart';
import type { Architecture } from './review';

describe('flowchart meaning', () => {
  it('preserves explicit roles independently of labels and visible branch count', () => {
    const graph: Architecture = {
      nodes: [
        { id: 'a', label: 'Untranslated condition', flowRole: 'decision', status: 'unchanged' },
      ],
      edges: [],
    };
    expect(flowRole(graph, 0)).toBe('decision');
  });
  it('does not invent starts or ends for an old partial graph', () => {
    const graph: Architecture = {
      nodes: [{ id: 'a', label: 'Service', status: 'unchanged' }],
      edges: [],
    };
    expect(flowRole(graph, 0)).toBe('process');
  });
});
