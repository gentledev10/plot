import type { ReviewMap } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { verifyLocations } from './review-locations';

const review: ReviewMap = {
  summary: 's',
  readingOrder: [],
  flows: [
    {
      title: 'Flow',
      steps: [
        { from: 'a', to: 'b', label: 'ok', location: { path: 'src/app.ts', line: 10 } },
        { from: 'b', to: 'c', label: 'past end', location: { path: 'src/app.ts', line: 99 } },
        { from: 'c', to: 'd', label: 'no location' },
      ],
    },
  ],
  architecture: {
    nodes: [{ id: 'n', label: 'N', changed: true, location: { path: 'missing.ts', line: 1 } }],
    edges: [],
  },
  risks: [{ title: 'r', detail: 'd', severity: 'low', location: { path: 'src/app.ts', line: 50 } }],
};

const lineCount = (path: string) => (path === 'src/app.ts' ? 50 : undefined);

describe('verifyLocations', () => {
  it('marks locations that point at real lines', () => {
    const verified = verifyLocations(review, lineCount);
    const steps = verified.flows[0]?.steps ?? [];
    expect(steps[0]?.location).toEqual({ path: 'src/app.ts', line: 10, verified: true });
    expect(verified.risks[0]?.location?.verified).toBe(true);
  });

  it('flags lines past the end of the file and files that do not exist', () => {
    const verified = verifyLocations(review, lineCount);
    expect(verified.flows[0]?.steps[1]?.location?.verified).toBe(false);
    expect(verified.architecture.nodes[0]?.location?.verified).toBe(false);
  });

  it('leaves items without a location alone', () => {
    const verified = verifyLocations(review, lineCount);
    expect(verified.flows[0]?.steps[2]).toEqual({ from: 'c', to: 'd', label: 'no location' });
  });
});
