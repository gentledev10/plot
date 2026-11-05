import { pullRequestKey } from '@shared/pull-request-ref';
import type { ReviewMap } from '@shared/review';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { ReviewPanel } from './ReviewPanel';
import { useReviewReading } from './ReviewReadingProvider';

const target = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };
const head = 'd'.repeat(40);

function Fixture() {
  const reading = useReviewReading();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          reading.select({ target: pullRequestKey(target), head, mode: 'unit', unitId: 'input' })
        }
      >
        Select unit
      </button>
      <ReviewPanel target={target} onOpenLocation={() => {}} />
    </>
  );
}

it('structures unit summaries, rationale evidence and file reading reasons', async () => {
  const review: ReviewMap = {
    summary: 'Overview.\n\n- Context',
    changes: [],
    architecture: { nodes: [], edges: [] },
    flows: [],
    impacts: [],
    readingOrder: [],
    units: [
      {
        id: 'input',
        title: 'Input handling',
        summary: 'Unit purpose.\n\n- Preserve inputs',
        rationale: 'Avoid **ambiguity**.\n\n- Reject `null`',
        rationaleEvidence: 'inferred',
        files: [
          {
            path: 'src/input.ts',
            role: 'implementation',
            reason: '1. Read the guard\n2. Read callers',
            ranges: [],
            beforeRanges: [],
          },
        ],
        changeTitles: [],
        visualTitles: [],
        simulationIds: [],
        reviewPointTitles: [],
      },
    ],
  };
  renderWithApi(<Fixture />, {
    getReviewStatus: vi
      .fn()
      .mockResolvedValue({ state: 'done', review, head, createdAt: new Date().toISOString() }),
    getPullRequestDiff: vi.fn().mockResolvedValue({ head, mergeBase: 'c'.repeat(40), files: [] }),
  });
  await screen.findByText('Overview.', { exact: false });
  await userEvent.click(screen.getByRole('button', { name: 'Select unit' }));
  const unit = screen.getByRole('region', { name: 'Input handling' });
  expect(within(unit).getByText('Unit purpose.').tagName).toBe('P');
  expect(within(unit).getByRole('heading', { name: 'Why this change' })).toBeVisible();
  expect(within(unit).getByText('ambiguity').tagName).toBe('STRONG');
  expect(within(unit).getByText('Read the guard').closest('ol')).not.toBeNull();
  expect(within(unit).getByText('Inference — check this')).toBeVisible();
});
