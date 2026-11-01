import type { Architecture } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { ensureArchitectureGroups } from './architecture-groups';

describe('architecture group completion', () => {
  it('uses actual source files when a model omits grouping, preserving changes and relations', () => {
    const map: Architecture = {
      nodes: [
        { id: 'ui', label: 'UI', status: 'unchanged', location: { path: 'ui.ts', line: 1 } },
        { id: 'api', label: 'API', status: 'changed', location: { path: 'api.ts', line: 2 } },
        { id: 'helper', label: 'Helper', status: 'added', location: { path: 'api.ts', line: 5 } },
        { id: 'caller', label: 'Caller', status: 'unchanged', evidence: 'inferred' },
      ],
      edges: [{ from: 'ui', to: 'api' }],
    };
    const grouped = ensureArchitectureGroups(map, 'ko');
    expect(grouped.groups?.map((group) => group.label)).toEqual(['ui.ts', 'api.ts', '주변 맥락']);
    expect(grouped.nodes[1]?.group).toBe(grouped.nodes[2]?.group);
    expect(grouped.nodes[1]?.status).toBe('changed');
    expect(grouped.edges).toEqual(map.edges);
    expect(grouped.grouping).toBe('source-files');
  });
  it('keeps explicit architecture groups and empty maps unchanged', () => {
    const map: Architecture = {
      groups: [{ id: 'runtime', label: 'Runtime' }],
      nodes: [{ id: 'a', label: 'A', status: 'changed', group: 'runtime' }],
      edges: [],
    };
    expect(ensureArchitectureGroups(map, 'en')).toBe(map);
    const empty = { nodes: [], edges: [] };
    expect(ensureArchitectureGroups(empty, 'en')).toBe(empty);
  });
});
