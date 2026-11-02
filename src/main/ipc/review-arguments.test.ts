import { describe, expect, it } from 'vitest';
import { argumentParsers } from './arguments';

const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const head = 'a'.repeat(40);
describe('review activity arguments', () => {
  it('accepts only scalar scenario values and bounded explicit test paths, not scripts or object payloads', () => {
    expect(
      argumentParsers.runReviewExecution([
        ref,
        {
          head,
          kind: 'scenario',
          simulationId: 'shipping',
          inputs: [{ id: 'amount', value: -1 }],
          command: 'evil',
        },
      ])[1],
    ).toEqual({
      head,
      kind: 'scenario',
      simulationId: 'shipping',
      inputs: [{ id: 'amount', value: -1 }],
    });
    for (const request of [
      { head, kind: 'shell', command: 'npm test' },
      { head, kind: 'tests', paths: ['../private.test.mjs'] },
      { head, kind: 'tests', paths: ['package.json'] },
      {
        head,
        kind: 'scenario',
        simulationId: 'shipping',
        inputs: [{ id: 'amount', value: { script: 'evil' } }],
      },
      {
        head,
        kind: 'scenario',
        simulationId: 'shipping',
        inputs: [{ id: 'amount', value: Infinity }],
      },
    ])
      expect(() => argumentParsers.runReviewExecution([ref, request])).toThrow();
  });
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
