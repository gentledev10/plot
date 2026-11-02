import { describe, expect, it } from 'vitest';
import { argumentParsers } from './arguments';

const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const head = 'a'.repeat(40);
describe('review activity arguments', () => {
  it('keeps an exact source range but never accepts renderer-supplied code text', () => {
    const [, parsed] = argumentParsers.askReview([
      ref,
      {
        head,
        question: ' Why? ',
        unitId: 'retry',
        selection: {
          path: 'src/retry.ts',
          side: 'original',
          startLine: 3,
          endLine: 4,
          text: 'forged source',
        },
      },
    ]);
    expect(parsed).toEqual({
      head,
      question: 'Why?',
      unitId: 'retry',
      selection: { path: 'src/retry.ts', side: 'original', startLine: 3, endLine: 4 },
    });
  });
  it('rejects traversal, oversized selections, invalid unit ids and arbitrary activity names', () => {
    for (const selection of [
      { path: '../private', side: 'modified', startLine: 1, endLine: 2 },
      { path: 'src/a.ts', side: 'modified', startLine: 1, endLine: 121 },
      { path: 'src/a.ts', side: 'script', startLine: 1, endLine: 2 },
    ])
      expect(() =>
        argumentParsers.askReview([ref, { head, question: 'Explain', selection }]),
      ).toThrow();
    expect(() => argumentParsers.verifyReview([ref, { head, unitId: '../unit' }])).toThrow();
    expect(() => argumentParsers.cancelReviewActivity([ref, 'shell'])).toThrow();
  });
});
