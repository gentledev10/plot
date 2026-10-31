import type { CodeLocation, ReviewMap } from '@shared/review';

export type LineCounter = (path: string) => number | undefined;

export function verifyLocations(review: ReviewMap, lineCount: LineCounter): ReviewMap {
  const check = <T extends { location?: CodeLocation }>(item: T): T => {
    if (!item.location) {
      return item;
    }
    const lines = lineCount(item.location.path);
    const verified = lines !== undefined && item.location.line <= lines;
    return { ...item, location: { ...item.location, verified } };
  };
  return {
    ...review,
    changes: review.changes.map(check),
    flows: review.flows.map((flow) => ({ ...flow, after: flow.after.map(check) })),
    architecture: { ...review.architecture, nodes: review.architecture.nodes.map(check) },
    impacts: review.impacts.map(check),
  };
}
