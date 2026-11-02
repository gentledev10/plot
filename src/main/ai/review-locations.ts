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
    ...(review.units
      ? {
          units: review.units.map((unit) => ({
            ...unit,
            files: unit.files.map((file) => ({
              ...file,
              ranges: file.ranges.filter((range) => range.endLine <= (lineCount(file.path) ?? 0)),
            })),
          })),
        }
      : {}),
    ...(review.simulations
      ? {
          simulations: review.simulations.map((simulation) => ({
            ...simulation,
            before: {
              ...simulation.before,
              nodes: simulation.before.nodes.map(({ location: _, ...node }) => node),
            },
            after: { ...simulation.after, nodes: simulation.after.nodes.map(check) },
          })),
        }
      : {}),
    flows: review.flows.map((flow) => ({ ...flow, after: flow.after.map(check) })),
    architecture: { ...review.architecture, nodes: review.architecture.nodes.map(check) },
    ...(review.visuals
      ? {
          visuals: review.visuals.map((visual) => ({
            ...visual,
            ...(visual.before
              ? {
                  before: {
                    ...visual.before,
                    nodes: visual.before.nodes.map(({ location: _, ...node }) => node),
                  },
                }
              : {}),
            ...(visual.after
              ? { after: { ...visual.after, nodes: visual.after.nodes.map(check) } }
              : {}),
          })),
        }
      : {}),
    impacts: review.impacts.map(check),
    ...(review.reviewPoints ? { reviewPoints: review.reviewPoints.map(check) } : {}),
    ...(review.customSections
      ? {
          customSections: review.customSections.map((section) => ({
            ...section,
            items: section.items.map(check),
            ...(section.diagram
              ? { diagram: { ...section.diagram, nodes: section.diagram.nodes.map(check) } }
              : {}),
          })),
        }
      : {}),
  };
}
