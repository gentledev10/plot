import { describe, expect, it } from 'vitest';
import { parseReviewMap, REVIEW_SCHEMA } from './review-schema';

function output(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'Adds a dark theme toggle.',
    readingOrder: [{ path: 'src/theme.ts', reason: 'Defines the palettes.' }],
    flows: [
      {
        title: 'Toggle theme',
        steps: [
          {
            from: 'SettingsView',
            to: 'ThemeStore',
            label: 'setTheme(dark)',
            location: { path: 'src/settings.ts', line: 12 },
          },
        ],
      },
    ],
    architecture: {
      nodes: [
        { id: 'ui', label: 'Settings UI', changed: true },
        { id: 'store', label: 'Theme store', changed: false },
      ],
      edges: [{ from: 'ui', to: 'store', label: 'writes' }],
    },
    risks: [
      {
        title: 'Contrast',
        detail: 'Muted text may be too dark.',
        severity: 'low',
        location: { path: 'src/theme.ts', line: 3 },
      },
    ],
    ...overrides,
  };
}

describe('REVIEW_SCHEMA', () => {
  it('requires every section, so the AI cannot skip one', () => {
    expect(REVIEW_SCHEMA.required).toEqual([
      'summary',
      'readingOrder',
      'flows',
      'architecture',
      'risks',
    ]);
  });
});

describe('parseReviewMap', () => {
  it('keeps a well-formed review as it is', () => {
    expect(parseReviewMap(output())).toEqual(output());
  });

  it('rejects output without a summary', () => {
    expect(() => parseReviewMap({ readingOrder: [] })).toThrow(
      expect.objectContaining({ code: 'ai-invalid-output' }),
    );
    expect(() => parseReviewMap('not json')).toThrow();
  });

  it('drops malformed items instead of failing the whole review', () => {
    const review = parseReviewMap(
      output({
        readingOrder: [{ path: 'ok.ts', reason: 'fine' }, { path: 42 }, 'nope'],
        risks: [{ title: 'Bad severity', detail: 'x', severity: 'critical' }],
      }),
    );
    expect(review.readingOrder).toEqual([{ path: 'ok.ts', reason: 'fine' }]);
    expect(review.risks).toEqual([]);
  });

  it('drops edges that point at nodes that do not exist', () => {
    const review = parseReviewMap(
      output({
        architecture: {
          nodes: [{ id: 'a', label: 'A', changed: true }],
          edges: [
            { from: 'a', to: 'missing' },
            { from: 'a', to: 'a', label: 'self' },
          ],
        },
      }),
    );
    expect(review.architecture.edges).toEqual([{ from: 'a', to: 'a', label: 'self' }]);
  });

  it('removes locations that escape the repository or have bad line numbers', () => {
    const review = parseReviewMap(
      output({
        risks: [
          {
            title: 'a',
            detail: 'x',
            severity: 'high',
            location: { path: '../etc/passwd', line: 1 },
          },
          { title: 'b', detail: 'x', severity: 'high', location: { path: 'src/a.ts', line: 0 } },
          { title: 'c', detail: 'x', severity: 'high', location: { path: './src/b.ts', line: 7 } },
        ],
      }),
    );
    expect(review.risks.map((risk) => risk.location)).toEqual([
      undefined,
      undefined,
      { path: 'src/b.ts', line: 7 },
    ]);
  });

  it('caps long text and long lists', () => {
    const review = parseReviewMap(
      output({
        summary: 'x'.repeat(10_000),
        flows: Array.from({ length: 20 }, (_, i) => ({
          title: `Flow ${i}`,
          steps: [{ from: 'a', to: 'b', label: 'call' }],
        })),
      }),
    );
    expect(review.summary.length).toBe(2_000);
    expect(review.summary.endsWith('…')).toBe(true);
    expect(review.flows).toHaveLength(5);
  });

  it('skips flows without usable steps', () => {
    const review = parseReviewMap(
      output({ flows: [{ title: 'Empty', steps: [{ from: '', to: 'b', label: 'x' }] }] }),
    );
    expect(review.flows).toEqual([]);
  });

  it('treats missing optional sections as empty', () => {
    expect(parseReviewMap({ summary: 'Only a summary.' })).toEqual({
      summary: 'Only a summary.',
      readingOrder: [],
      flows: [],
      architecture: { nodes: [], edges: [] },
      risks: [],
    });
  });
});
