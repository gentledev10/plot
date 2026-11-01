import type { ReviewMap } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { verifyLocations } from './review-locations';

const review: ReviewMap = {
  summary: 's',
  changes: [{ title: 'c', before: 'b', after: 'a', location: { path: 'src/a.ts', line: 3 } }],
  flows: [
    {
      title: 'f',
      before: [{ from: 'x', to: 'y', label: 'old' }],
      after: [{ from: 'x', to: 'y', label: 'new', location: { path: 'src/a.ts', line: 10 } }],
    },
  ],
  architecture: {
    nodes: [{ id: 'n', label: 'N', status: 'changed', location: { path: 'src/gone.ts', line: 1 } }],
    edges: [],
  },
  impacts: [{ area: 'i', detail: 'd', location: { path: 'src/a.ts', line: 4 } }],
  readingOrder: [],
};

const lines = (path: string) => (path === 'src/a.ts' ? 5 : undefined);

describe('verifyLocations', () => {
  it('verifies only the current side of a visual comparison', () => {
    const graph = {
      nodes: [
        {
          id: 'n',
          label: 'Service',
          status: 'changed' as const,
          location: { path: 'src/a.ts', line: 3 },
        },
      ],
      edges: [],
    };
    const checked = verifyLocations(
      {
        ...review,
        visuals: [
          {
            kind: 'components',
            title: 'Architecture',
            takeaway: 'New boundary.',
            scope: '',
            before: graph,
            after: graph,
          },
        ],
      },
      lines,
    );
    expect(checked.visuals?.[0]?.before?.nodes[0]).not.toHaveProperty('location');
    expect(checked.visuals?.[0]?.after?.nodes[0]?.location?.verified).toBe(true);
  });
  it('marks locations that point at real lines', () => {
    const verified = verifyLocations(review, lines);
    expect(verified.changes[0]?.location?.verified).toBe(true);
    expect(verified.impacts[0]?.location?.verified).toBe(true);
  });

  it('flags lines past the end of the file and files that do not exist', () => {
    const verified = verifyLocations(review, lines);
    expect(verified.flows[0]?.after[0]?.location?.verified).toBe(false);
    expect(verified.architecture.nodes[0]?.location?.verified).toBe(false);
  });

  it('leaves items without a location alone', () => {
    expect(verifyLocations(review, lines).flows[0]?.before[0]).toEqual({
      from: 'x',
      to: 'y',
      label: 'old',
    });
  });
});
