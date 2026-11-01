import type { Architecture } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { architectureOverview } from './architecture-overview';

function graph(): Architecture {
  return {
    groups: ['api', 'dev', 'build', 'runtime'].map((id) => ({ id, label: id })),
    nodes: [
      ['api', 'unchanged'],
      ['api', 'unchanged'],
      ['dev', 'added'],
      ['dev', 'added'],
      ['build', 'changed'],
      ['build', 'unchanged'],
      ['runtime', 'removed'],
      ['runtime', 'removed'],
    ].map(([group, status], index) => ({
      id: `n${index}`,
      label: `Component ${index}`,
      group,
      status: status as Architecture['nodes'][number]['status'],
    })),
    edges: [
      { from: 'n0', to: 'n1', evidence: 'code' },
      { from: 'n0', to: 'n2', evidence: 'code' },
      { from: 'n1', to: 'n3', evidence: 'inferred' },
      { from: 'n0', to: 'n4', evidence: 'code' },
      { from: 'n4', to: 'n6', evidence: 'docs' },
      { from: 'missing', to: 'n0' },
    ],
  };
}

describe('architectureOverview', () => {
  it('summarizes existing areas without losing or mutating the detailed graph', () => {
    const original = graph();
    const snapshot = structuredClone(original);
    const result = architectureOverview(original);
    expect(result?.nodes.map((node) => [node.label, node.status])).toEqual([
      ['api', 'unchanged'],
      ['dev', 'added'],
      ['build', 'changed'],
      ['runtime', 'removed'],
    ]);
    expect(result?.nodes.every((node) => node.location === undefined)).toBe(true);
    expect(original).toEqual(snapshot);
  });

  it('deduplicates links, omits internal/dangling links and preserves uncertainty', () => {
    const original = graph();
    original.nodes = original.nodes.map((node, index) =>
      index === 2 ? { ...node, evidence: 'inferred' } : node,
    );
    const result = architectureOverview(original);
    expect(result?.nodes[1]?.evidence).toBe('inferred');
    expect(result?.edges).toEqual([
      { from: 'area-0', to: 'area-1', evidence: 'inferred' },
      { from: 'area-0', to: 'area-2', evidence: 'code' },
      { from: 'area-2', to: 'area-3', evidence: 'docs' },
    ]);
  });

  it('retains ungrouped components and their code locations instead of silently dropping them', () => {
    const original = graph();
    original.nodes.push({
      id: 'outside',
      label: 'External caller',
      status: 'unchanged',
      evidence: 'code',
      location: { path: 'src/caller.ts', line: 12 },
    });
    original.edges.push({ from: 'outside', to: 'n0', evidence: 'code' });
    const result = architectureOverview(original);
    expect(result?.nodes.at(-1)).toMatchObject({
      id: 'component-8',
      label: 'External caller',
      location: { path: 'src/caller.ts', line: 12 },
    });
    expect(result?.edges.at(-1)).toEqual({
      from: 'component-8',
      to: 'area-0',
      evidence: 'code',
    });
  });

  it('keeps small, ungrouped or file-based maps in their original view', () => {
    expect(architectureOverview({ ...graph(), nodes: graph().nodes.slice(0, 7) })).toBeUndefined();
    expect(architectureOverview({ ...graph(), groups: [] })).toBeUndefined();
    expect(architectureOverview({ ...graph(), grouping: 'source-files' })).toBeUndefined();
    const fragmented = graph();
    fragmented.groups = fragmented.nodes.map((node) => ({ id: node.id, label: node.label }));
    fragmented.nodes = fragmented.nodes.map((node) => ({ ...node, group: node.id }));
    expect(architectureOverview(fragmented)).toBeUndefined();
  });
});
