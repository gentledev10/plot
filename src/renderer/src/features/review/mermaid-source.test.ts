import { describe, expect, it } from 'vitest';
import {
  architectureToMermaid,
  compareFlow,
  nodeIndexFromElementId,
  safeLabel,
  sequenceToMermaid,
} from './mermaid-source';

it('exports the same conventional symbols for a custom flowchart, leaving component boxes unchanged', async () => {
  const graph = {
    nodes: [
      { id: 'start', label: 'Start', status: 'unchanged' as const, flowRole: 'start' as const },
      { id: 'read', label: 'Read input', status: 'unchanged' as const, flowRole: 'input' as const },
      { id: 'check', label: 'Valid?', status: 'unchanged' as const, flowRole: 'decision' as const },
      {
        id: 'work',
        label: 'Calculate',
        status: 'unchanged' as const,
        flowRole: 'process' as const,
      },
      {
        id: 'write',
        label: 'Write output',
        status: 'unchanged' as const,
        flowRole: 'output' as const,
      },
      { id: 'end', label: 'End', status: 'unchanged' as const, flowRole: 'end' as const },
    ],
    edges: [],
  };
  const source = architectureToMermaid(graph, 'light', 'TD', true).source;
  const { default: mermaid } = await import('mermaid');
  await expect(mermaid.parse(source)).resolves.toMatchObject({ diagramType: 'flowchart-v2' });
  expect(source).toContain('n0(["Start"])');
  expect(source).toContain('n1[/"Read input"/]');
  expect(source).toContain('n2{"Valid?"}');
  expect(source).toContain('n3["Calculate"]');
  expect(source).toContain('n4[/"Write output"/]');
  expect(source).toContain('n5(["End"])');
  expect(architectureToMermaid(graph, 'light').source).toContain('n2["Valid?"]');
});

describe('safeLabel', () => {
  it('keeps readable text, including non-Latin scripts', () => {
    expect(safeLabel('UserService.save(user)')).toBe('UserService.save(user)');
    expect(safeLabel('게시글 저장')).toBe('게시글 저장');
  });

  it('removes characters that would end or escape a Mermaid statement', () => {
    expect(safeLabel('a; click n0 call evil()')).toBe('a click n0 call evil()');
    expect(safeLabel('say "hi"\nnext: line #1 `x`')).toBe('say hi next line 1 x');
    expect(safeLabel('a%%{init: {"theme": "x"}}%%')).toBe('a init theme x');
    expect(safeLabel('A@{ shape: circle } & B | C <b>')).toBe('A shape circle B C b');
  });

  it('shortens long labels and never returns an empty one', () => {
    expect(safeLabel('x'.repeat(100))).toHaveLength(60);
    expect(safeLabel(';;;')).toBe('?');
  });
});

describe('sequenceToMermaid', () => {
  const steps = [
    { from: 'PostController', to: 'PostService', label: 'create(request)' },
    { from: 'PostService', to: 'PostRepository', label: 'save(post)' },
    { from: 'PostService', to: 'PostController', label: 'return id' },
  ];

  it('builds a sequence diagram with stable participant ids', () => {
    expect(sequenceToMermaid(steps)).toBe(
      [
        'sequenceDiagram',
        '  participant p0 as PostController',
        '  participant p1 as PostService',
        '  participant p2 as PostRepository',
        '  p0->>p1: create(request)',
        '  p1->>p2: save(post)',
        '  p1->>p0: return id',
      ].join('\n'),
    );
  });

  it('shades the steps it is asked to highlight', () => {
    const lines = sequenceToMermaid(steps, new Set([1]), 'removed').split('\n');
    expect(lines.slice(-4)).toEqual([
      '  rect rgba(219, 92, 92, 0.18)',
      '    p1->>p2: save(post)',
      '  end',
      '  p1->>p0: return id',
    ]);
  });
});

describe('compareFlow', () => {
  it('finds the steps that were added and removed by the change', () => {
    const comparison = compareFlow({
      title: 'Save post',
      before: [
        { from: 'Controller', to: 'Repository', label: 'save(post)' },
        { from: 'Controller', to: 'Client', label: 'return id' },
      ],
      after: [
        { from: 'Controller', to: 'Service', label: 'create(post)' },
        { from: 'Service', to: 'Repository', label: 'save(post)' },
        { from: 'controller', to: 'client', label: 'return  id' },
      ],
    });
    expect([...comparison.removed]).toEqual([0]);
    expect([...comparison.added]).toEqual([0, 1]);
  });

  it('highlights nothing in a flow that is entirely new or entirely gone', () => {
    const step = { from: 'A', to: 'B', label: 'call()' };
    expect(compareFlow({ title: 'New', before: [], after: [step] }).added.size).toBe(0);
    expect(compareFlow({ title: 'Gone', before: [step], after: [] }).removed.size).toBe(0);
  });
});

describe('architectureToMermaid', () => {
  const architecture = {
    nodes: [
      { id: 'api', label: 'API layer', status: 'changed' as const },
      { id: 'db.store', label: 'Database "store"', status: 'unchanged' as const },
      { id: 'cache', label: 'Cache', status: 'added' as const },
    ],
    edges: [
      { from: 'api', to: 'db.store', label: 'writes' },
      { from: 'api', to: 'cache' },
    ],
  };

  it('draws a left-to-right flowchart and colors components by what happened to them', () => {
    const { source } = architectureToMermaid(architecture, 'light');
    expect(source.split('\n').slice(0, 6)).toEqual([
      'flowchart LR',
      '  n0["API layer"]:::changed',
      '  n1["Database store"]',
      '  n2["Cache"]:::added',
      '  n0 -->|"writes"| n1',
      '  n0 --> n2',
    ]);
    expect(source).toContain('classDef removed');
  });

  it('uses darker colors in dark mode', () => {
    expect(architectureToMermaid(architecture, 'dark').source).toContain('fill:#2e436e');
  });
  it('groups the wider system, highlights changed nodes and dashes inferred context safely', () => {
    const source = architectureToMermaid(
      {
        ...architecture,
        groups: [
          { id: 'bad; click x', label: 'UI "layer"; click n0 evil()' },
          { id: 'data', label: 'Data' },
        ],
        nodes: architecture.nodes.map((node, index) => ({
          ...node,
          group: index === 0 ? 'bad; click x' : 'data',
          evidence: index === 1 ? ('inferred' as const) : ('code' as const),
        })),
      },
      'dark',
    ).source;
    expect(source).toContain('subgraph g0["UI layer click n0 evil()"]');
    expect(source).toContain('subgraph g1["Data"]');
    expect(source).toContain('n0["API layer"]:::changed');
    expect(source).toContain('class n1 inferred');
    expect(source).toContain('stroke-dasharray:5 4');
    expect(source).not.toContain('bad; click x');
    expect(source).not.toContain('\nclick ');
  });
});

describe('nodeIndexFromElementId', () => {
  it('reads the node index from the ids Mermaid gives flowchart nodes', () => {
    expect(nodeIndexFromElementId('flowchart-n3-12')).toBe(3);
    expect(nodeIndexFromElementId('diagram-r1g-flowchart-n1-1')).toBe(1);
    expect(nodeIndexFromElementId('flowchart-other-1')).toBeUndefined();
  });
});
