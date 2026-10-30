import { describe, expect, it } from 'vitest';
import {
  architectureToMermaid,
  flowToMermaid,
  nodeIndexFromElementId,
  safeLabel,
} from './mermaid-source';

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

describe('flowToMermaid', () => {
  it('builds a sequence diagram with stable participant ids', () => {
    const source = flowToMermaid({
      title: 'Save post',
      steps: [
        { from: 'PostController', to: 'PostService', label: 'create(request)' },
        { from: 'PostService', to: 'PostRepository', label: 'save(post)' },
        { from: 'PostService', to: 'PostController', label: 'return id' },
      ],
    });
    expect(source).toBe(
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
});

describe('architectureToMermaid', () => {
  const architecture = {
    nodes: [
      { id: 'api', label: 'API layer', changed: true },
      { id: 'db.store', label: 'Database "store"', changed: false },
    ],
    edges: [
      { from: 'api', to: 'db.store', label: 'writes' },
      { from: 'db.store', to: 'api' },
    ],
  };

  it('draws a left-to-right flowchart and marks changed components', () => {
    const { source, nodeIds } = architectureToMermaid(architecture, 'light');
    expect(source.split('\n')).toEqual([
      'flowchart LR',
      '  n0["API layer"]:::changed',
      '  n1["Database store"]',
      '  n0 -->|"writes"| n1',
      '  n1 --> n0',
      expect.stringMatching(/^ {2}classDef changed fill:#d4e2ff/),
    ]);
    expect(nodeIds).toEqual(['api', 'db.store']);
  });

  it('uses darker colors in dark mode', () => {
    expect(architectureToMermaid(architecture, 'dark').source).toContain('fill:#2e436e');
  });
});

describe('nodeIndexFromElementId', () => {
  it('reads the node index from the ids Mermaid gives flowchart nodes', () => {
    expect(nodeIndexFromElementId('flowchart-n3-12')).toBe(3);
    expect(nodeIndexFromElementId('flowchart-other-1')).toBeUndefined();
  });
});
