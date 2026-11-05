import type { ReviewMap } from '@shared/review';
import { BUILTIN_STEPS } from '@shared/review-plan';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { initializePreferences } from '../../lib/preferences';
import { ReviewMapView } from './ReviewPanel';

const review: ReviewMap = {
  summary:
    'Purpose of the change.\n\n- Retain existing inputs\n- Add a new path\n\n3. Inspect the handler\n4. Inspect the tests',
  changes: [],
  architecture: { nodes: [], edges: [] },
  flows: [],
  impacts: [],
  readingOrder: [],
};

describe('Review prose readability', () => {
  it('renders overview paragraphs and explicit lists as separate semantic blocks', () => {
    renderWithApi(
      <ReviewMapView review={review} changedPaths={new Set()} onOpenLocation={() => {}} />,
    );
    const overview = screen.getByRole('article', { name: 'At a glance' });
    expect(within(overview).getByText('Purpose of the change.').tagName).toBe('P');
    const lists = within(overview).getAllByRole('list');
    expect(lists.map((list) => list.tagName)).toEqual(['UL', 'OL']);
    expect(lists[1]).toHaveAttribute('start', '3');
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('separates change headings, before/now blocks, concerns, checks and references', () => {
    renderWithApi(
      <ReviewMapView
        review={{
          ...review,
          changes: [
            {
              title: 'Input **validation**',
              before: 'Legacy behavior.\n\n- No guard',
              after: 'New behavior.\n\n- Reject `null`',
              location: { path: 'src/input.ts', line: 8, verified: true },
            },
          ],
          reviewPoints: [
            {
              title: 'Boundary values',
              reason: 'The boundary is **uncertain**.\n\n- Missing evidence',
              check: '1. Inspect the boundary\n2. Read the test',
              evidence: 'inferred',
              location: { path: 'src/input.ts', line: 9, verified: false },
            },
          ],
        }}
        changedPaths={new Set(['src/input.ts'])}
        onOpenLocation={() => {}}
      />,
    );
    const changes = screen.getByRole('article', { name: 'Key changes' });
    expect(
      within(changes).getByRole('heading', { level: 4, name: 'Input validation' }),
    ).toBeVisible();
    expect(within(changes).getByText('Legacy behavior.').closest('dd')).not.toBeNull();
    expect(within(changes).getByText('null').closest('li')).not.toBeNull();
    const focus = screen.getByRole('article', { name: 'Review focus' });
    expect(within(focus).getByRole('heading', { level: 4, name: 'Boundary values' })).toBeVisible();
    expect(within(focus).getByText('uncertain').tagName).toBe('STRONG');
    expect(within(focus).getByText('Inspect the boundary').closest('ol')).not.toBeNull();
    expect(within(focus).getByText('Inference — check this')).toBeVisible();
    expect(within(focus).getByText('unverified')).toBeVisible();
  });

  it('structures map summary and analysis scope without modifying diagram content', () => {
    renderWithApi(
      <ReviewMapView
        review={{
          ...review,
          architecture: {
            nodes: [{ id: 'input', label: 'Input', status: 'changed' }],
            edges: [],
            summary: 'Map context.\n\n- A bounded view',
            scope: 'Read **source** only.\n\n- Tests not executed',
          },
        }}
        changedPaths={new Set()}
        onOpenLocation={() => {}}
      />,
    );
    expect(screen.getByText('Map context.').tagName).toBe('P');
    expect(screen.getByText('A bounded view').closest('ul')).not.toBeNull();
    expect(screen.getByText('source').tagName).toBe('STRONG');
  });

  it('formats impact details, reading reasons and custom section items', () => {
    initializePreferences(
      {
        'review-plan': {
          version: 2,
          steps: [
            ...BUILTIN_STEPS.map(({ id }) => ({
              id,
              kind: id,
              title: '',
              instructions: '',
              visible: true,
              detail: 'balanced',
              format: 'text',
            })),
            {
              id: 'custom_extra',
              kind: 'custom',
              title: 'Extra context',
              instructions: 'Explain context',
              visible: true,
              detail: 'balanced',
              format: 'text',
            },
          ],
        },
      },
      () => {},
    );
    renderWithApi(
      <ReviewMapView
        review={{
          ...review,
          impacts: [{ area: 'Callers', detail: '- Inspect `caller`' }],
          readingOrder: [{ path: 'src/input.ts', reason: 'Read **first**.' }],
          customSections: [
            {
              id: 'custom_extra',
              body: 'Context.\n\n- First item',
              items: [{ area: 'Storage', detail: '1. Read the schema\n2. Read the migration' }],
            },
          ],
        }}
        changedPaths={new Set()}
        onOpenLocation={() => {}}
      />,
    );
    expect(screen.getByText('caller').tagName).toBe('CODE');
    expect(screen.getByText('first').tagName).toBe('STRONG');
    const custom = screen.getByRole('article', { name: 'Extra context' });
    expect(within(custom).getByRole('heading', { level: 4, name: 'Storage' })).toBeVisible();
    expect(within(custom).getByText('Read the schema').closest('ol')).not.toBeNull();
  });
});
