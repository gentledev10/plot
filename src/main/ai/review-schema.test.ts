import { describe, expect, it } from 'vitest';
import { parseReviewMap, REVIEW_SCHEMA } from './review-schema';

function output(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'Adds a dark theme toggle.',
    changes: [
      {
        title: 'Theme follows the toggle',
        before: 'The app always used the light theme.',
        after: 'The toggle switches between light and dark.',
        location: { path: 'src/theme.ts', line: 3 },
      },
    ],
    flows: [
      {
        title: 'Toggle theme',
        before: [{ from: 'SettingsView', to: 'Page', label: 'reload()', location: null }],
        after: [
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
        { id: 'ui', label: 'Settings UI', status: 'changed', location: null },
        { id: 'store', label: 'Theme store', status: 'added', location: null },
      ],
      edges: [{ from: 'ui', to: 'store', label: 'writes' }],
    },
    impacts: [{ area: 'Saved settings', detail: 'Adds a theme key.', location: null }],
    readingOrder: [{ path: 'src/theme.ts', reason: 'Defines the palettes.' }],
    ...overrides,
  };
}

describe('REVIEW_SCHEMA', () => {
  it('requires every section, so the AI cannot skip one', () => {
    expect(REVIEW_SCHEMA.required).toEqual([
      'summary',
      'changes',
      'flows',
      'architecture',
      'impacts',
      'readingOrder',
      'customSections',
    ]);
  });

  it('follows the strict rules OpenAI structured outputs enforce for Codex', () => {
    const problems: string[] = [];
    const visit = (schema: unknown, path: string) => {
      if (typeof schema !== 'object' || schema === null) {
        return;
      }
      const node = schema as Record<string, unknown>;
      if (node.type === 'object') {
        const keys = Object.keys((node.properties ?? {}) as object);
        const required = (node.required ?? []) as string[];
        if (node.additionalProperties !== false) {
          problems.push(`${path} allows extra properties`);
        }
        for (const key of keys.filter((name) => !required.includes(name))) {
          problems.push(`${path}.${key} is not required`);
        }
      }
      for (const [key, value] of Object.entries(node)) {
        visit(value, `${path}.${key}`);
      }
    };
    visit(REVIEW_SCHEMA, 'review');
    expect(problems).toEqual([]);
  });
});

describe('parseReviewMap', () => {
  it('accepts bounded custom content while rejecting unsafe ids, paths and disconnected edges', () => {
    const section = {
      id: 'custom_checks',
      body: 'x'.repeat(7000),
      items: [{ area: 'Rollback', detail: 'Check data', location: { path: '../secret', line: 1 } }],
      diagram: {
        nodes: [
          {
            id: 'a',
            label: 'Module',
            status: 'changed',
            location: { path: 'src/app.ts', line: 2 },
          },
        ],
        edges: [{ from: 'a', to: 'missing' }],
      },
    };
    const review = parseReviewMap(
      output({ customSections: [section, section, { ...section, id: '<script>' }] }),
    );
    expect(review.customSections).toHaveLength(1);
    expect(review.customSections?.[0]?.body).toHaveLength(6000);
    expect(review.customSections?.[0]?.items[0]).not.toHaveProperty('location');
    expect(review.customSections?.[0]?.diagram?.edges).toEqual([]);
    expect(review.customSections?.[0]?.diagram?.nodes[0]?.location).toEqual({
      path: 'src/app.ts',
      line: 2,
    });
  });
  it('keeps a well-formed overview, dropping null locations', () => {
    const review = parseReviewMap(output());
    expect(review.changes[0]).toEqual({
      title: 'Theme follows the toggle',
      before: 'The app always used the light theme.',
      after: 'The toggle switches between light and dark.',
      location: { path: 'src/theme.ts', line: 3 },
    });
    expect(review.architecture.nodes).toEqual([
      { id: 'ui', label: 'Settings UI', status: 'changed' },
      { id: 'store', label: 'Theme store', status: 'added' },
    ]);
    expect(review.impacts).toEqual([{ area: 'Saved settings', detail: 'Adds a theme key.' }]);
  });

  it('keeps no location for steps before the change, which may cite code that is gone', () => {
    const review = parseReviewMap(
      output({
        flows: [
          {
            title: 'Toggle theme',
            before: [
              { from: 'A', to: 'B', label: 'old()', location: { path: 'src/a.ts', line: 1 } },
            ],
            after: [],
          },
        ],
      }),
    );
    expect(review.flows[0]?.before).toEqual([{ from: 'A', to: 'B', label: 'old()' }]);
  });

  it('rejects output without a summary', () => {
    expect(() => parseReviewMap({ changes: [] })).toThrow(
      expect.objectContaining({ code: 'ai-invalid-output' }),
    );
    expect(() => parseReviewMap(null)).toThrow();
  });

  it('drops malformed items instead of failing the whole overview', () => {
    const review = parseReviewMap(
      output({
        changes: [{ title: 'No sides', before: '', after: '' }, { title: 'x' }, 'text'],
        architecture: {
          nodes: [
            { id: 'ui', label: 'UI', status: 'changed' },
            { id: 'odd', label: 'Odd', status: 'rewritten' },
          ],
          edges: [],
        },
        impacts: [{ detail: 'No area' }],
      }),
    );
    expect(review.changes).toEqual([]);
    expect(review.architecture.nodes.map((node) => node.id)).toEqual(['ui']);
    expect(review.impacts).toEqual([]);
  });

  it('drops edges that point at nodes that do not exist', () => {
    const review = parseReviewMap(
      output({
        architecture: {
          nodes: [{ id: 'a', label: 'A', status: 'changed' }],
          edges: [
            { from: 'a', to: 'missing' },
            { from: 'a', to: 'a', label: null },
          ],
        },
      }),
    );
    expect(review.architecture.edges).toEqual([{ from: 'a', to: 'a' }]);
  });

  it('removes locations that escape the repository or have bad line numbers', () => {
    const review = parseReviewMap(
      output({
        impacts: [
          { area: 'a', detail: 'd', location: { path: '../etc/passwd', line: 1 } },
          { area: 'b', detail: 'd', location: { path: 'src/a.ts', line: 0 } },
          { area: 'c', detail: 'd', location: { path: './src/a.ts', line: 4 } },
        ],
      }),
    );
    expect(review.impacts.map((impact) => impact.location)).toEqual([
      undefined,
      undefined,
      { path: 'src/a.ts', line: 4 },
    ]);
  });

  it('caps long text and long lists', () => {
    const review = parseReviewMap(
      output({
        summary: 'x'.repeat(5_000),
        impacts: Array.from({ length: 40 }, (_, index) => ({ area: `a${index}`, detail: 'd' })),
      }),
    );
    expect(review.summary.length).toBe(2_000);
    expect(review.impacts).toHaveLength(15);
  });

  it('skips flows with no steps on either side', () => {
    const review = parseReviewMap(
      output({
        flows: [{ title: 'Empty', before: [], after: [{ from: '', to: 'b', label: 'x' }] }],
      }),
    );
    expect(review.flows).toEqual([]);
  });

  it('treats missing sections as empty', () => {
    expect(parseReviewMap({ summary: 'Only a summary.' })).toEqual({
      summary: 'Only a summary.',
      changes: [],
      flows: [],
      architecture: { nodes: [], edges: [] },
      impacts: [],
      readingOrder: [],
    });
  });
});
