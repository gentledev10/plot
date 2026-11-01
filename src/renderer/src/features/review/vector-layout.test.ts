import type { Architecture } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { labelLines, layoutVectorGraph } from './vector-layout';

const graph: Architecture = {
  groups: [
    { id: 'api', label: 'Public API' },
    { id: 'processing', label: 'Processing' },
  ],
  nodes: [
    { id: 'entry', label: 'Public entry point', group: 'api', status: 'unchanged' },
    { id: 'config', label: 'Configuration', group: 'api', status: 'changed' },
    { id: 'environment', label: '독립적인 실행 환경', group: 'processing', status: 'added' },
    { id: 'runner', label: 'Module runner', group: 'processing', status: 'changed' },
  ],
  edges: [
    { from: 'entry', to: 'config', label: 'resolve' },
    { from: 'config', to: 'environment', label: 'create' },
    { from: 'environment', to: 'runner', label: 'execute' },
  ],
};

describe('vector layout', () => {
  it('keeps subsystem boundaries and routes every relationship to real components', async () => {
    const result = await layoutVectorGraph(graph);
    expect(result.nodes).toHaveLength(4);
    expect(result.groups).toHaveLength(2);
    expect(result.edges).toHaveLength(3);
    for (const node of result.nodes) {
      const group = result.groups.find(
        (candidate) =>
          node.x >= candidate.x &&
          node.y >= candidate.y &&
          node.x + node.width <= candidate.x + candidate.width &&
          node.y + node.height <= candidate.y + candidate.height,
      );
      expect(group).toBeDefined();
    }
    for (const edge of result.edges) {
      expect(edge.path).toMatch(/^M/);
      expect(edge.path).not.toMatch(/NaN|undefined/);
      const relation = graph.edges[edge.index];
      const from = result.nodes.find((node) => graph.nodes[node.index]?.id === relation?.from);
      const to = result.nodes.find((node) => graph.nodes[node.index]?.id === relation?.to);
      const points = [...edge.path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }));
      for (const [point, node] of [
        [points[0], from],
        [points.at(-1), to],
      ] as const) {
        expect(point).toBeDefined();
        expect(node).toBeDefined();
        if (!point || !node) continue;
        expect(point.x).toBeGreaterThanOrEqual(node.x - 1);
        expect(point.x).toBeLessThanOrEqual(node.x + node.width + 1);
        expect(point.y).toBeGreaterThanOrEqual(node.y - 1);
        expect(point.y).toBeLessThanOrEqual(node.y + node.height + 1);
      }
    }
  });
  it('wraps long identifiers and Korean labels without losing their content', () => {
    const label = '아주긴이름의EnvironmentConfiguration';
    expect(labelLines(label).length).toBeGreaterThan(1);
    expect(labelLines(label).join('')).toBe(label);
  });
});
