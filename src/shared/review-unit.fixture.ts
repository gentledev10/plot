import type { ReviewUnit } from './review-unit';

export const retryUnit = (): ReviewUnit => ({
  id: 'retry',
  title: 'Retry temporary failures',
  summary: 'Temporary errors retry while permanent failures stop.',
  rationale: 'The author wants reliable delivery.',
  rationaleEvidence: 'description',
  files: [
    {
      path: 'src/retry.ts',
      role: 'implementation',
      reason: 'Defines retry decisions.',
      ranges: [{ startLine: 4, endLine: 8 }],
      beforeRanges: [{ startLine: 3, endLine: 6 }],
    },
    {
      path: 'src/retry.test.ts',
      role: 'test',
      reason: 'Checks retry boundaries.',
      ranges: [],
      beforeRanges: [],
    },
  ],
  changeTitles: ['Temporary failures'],
  visualTitles: [],
  simulationIds: [],
  reviewPointTitles: [],
});
