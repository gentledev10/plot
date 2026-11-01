import { defaultReviewPlan, REVIEW_PLAN_PREFERENCE } from '@shared/review-plan';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { initializePreferences } from '../../lib/preferences';
import { ReviewFormatSettings } from './ReviewFormatSettings';
import { ReviewPanel } from './ReviewPanel';

vi.mock('./MermaidDiagram', () => ({ MermaidDiagram: () => null }));
const target = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };
const review = {
  summary: 'Saved overview',
  changes: [],
  flows: [],
  architecture: { nodes: [], edges: [] },
  impacts: [{ area: 'Callers', detail: 'Check callers' }],
  readingOrder: [],
};
function setup(setPreference = vi.fn().mockResolvedValue(undefined)) {
  return renderWithApi(
    <>
      <ReviewFormatSettings />
      <ReviewPanel target={target} onOpenLocation={() => {}} />
    </>,
    {
      setPreference,
      getReviewStatus: vi.fn().mockResolvedValue({
        state: 'done',
        review,
        head: 'abc',
        createdAt: new Date().toISOString(),
      }),
      getPullRequestDiff: vi.fn().mockResolvedValue({ files: [] }),
      startReview: vi.fn().mockResolvedValue(undefined),
    },
  );
}

describe('review format', () => {
  it('reorders saved cards by drag without running an analysis or marking it stale', async () => {
    const { api } = setup();
    await screen.findByText('Saved overview');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key),
      types: ['application/x-plot-review-step'],
    };
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag What else it affects' }), {
      dataTransfer,
    });
    const destination = screen
      .getByRole('list', { name: 'Review steps' })
      .querySelector('[data-step-id="summary"]');
    if (!destination) throw new Error('Missing target');
    fireEvent.dragOver(destination, { dataTransfer, clientY: -1 });
    fireEvent.drop(destination, { dataTransfer });
    expect(screen.getAllByRole('article').map((element) => element.dataset.stepId)).toEqual([
      'impacts',
      'summary',
    ]);
    expect(screen.queryByText(/Your review instructions changed/)).not.toBeInTheDocument();
    expect(api.startReview).not.toHaveBeenCalled();
    await waitFor(() => expect(api.setPreference).toHaveBeenCalled());
  });
  it('supports keyboard-friendly movement, visibility and collapsible review cards', async () => {
    const { api } = setup();
    await screen.findByText('Saved overview');
    await userEvent.click(screen.getByRole('button', { name: 'Move Summary down' }));
    expect(
      within(screen.getByRole('list', { name: 'Review steps' })).getAllByRole('listitem')[1],
    ).toHaveAttribute('data-step-id', 'summary');
    const summary = screen.getByRole('article', { name: /Summary/ });
    await userEvent.click(within(summary).getByRole('button'));
    expect(screen.getByText('Saved overview')).not.toBeVisible();
    const editor = screen
      .getByRole('list', { name: 'Review steps' })
      .querySelector('[data-step-id="summary"]');
    if (!editor) throw new Error('Missing summary');
    await userEvent.click(within(editor as HTMLElement).getByRole('checkbox'));
    expect(screen.queryByRole('article', { name: /Summary/ })).not.toBeInTheDocument();
    expect(api.startReview).not.toHaveBeenCalled();
  });
  it('adds a checklist, preserves old results and flushes latest edits before generating', async () => {
    const { api } = setup();
    await screen.findByText('Saved overview');
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await userEvent.clear(screen.getByLabelText('Card title'));
    await userEvent.type(screen.getByLabelText('Card title'), 'Failure paths');
    await userEvent.selectOptions(screen.getByLabelText('Format'), 'checklist');
    await userEvent.clear(screen.getByLabelText('Additional AI instructions'));
    await userEvent.type(
      screen.getByLabelText('Additional AI instructions'),
      'Explain rollback behavior',
    );
    expect(screen.getByText(/Your review instructions changed/)).toBeInTheDocument();
    expect(screen.getByText('Saved overview')).toBeVisible();
    expect(screen.getByText('Generate again to fill this step.')).toBeVisible();
    expect(api.startReview).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Generate again' }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(api.startReview).toHaveBeenCalledOnce());
    expect(api.setPreference).toHaveBeenLastCalledWith(
      REVIEW_PLAN_PREFERENCE,
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            title: 'Failure paths',
            format: 'checklist',
            instructions: 'Explain rollback behavior',
          }),
        ]),
      }),
    );
    expect(vi.mocked(api.setPreference).mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(api.startReview).mock.invocationCallOrder[0] as number,
    );
  });
  it('blocks generation after a save failure and can retry', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const { api } = setup(save);
    await screen.findByText('Saved overview');
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Generate again' }).at(-1) as HTMLElement,
    );
    await screen.findAllByText('Could not save the review format. Retry before generating.');
    expect(api.startReview).not.toHaveBeenCalled();
    save.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Saved automatically');
  });
  it('restores defaults and offers undo, keeping at least one visible step', async () => {
    const plan = defaultReviewPlan();
    initializePreferences(
      {
        [REVIEW_PLAN_PREFERENCE]: {
          steps: plan.steps.map((s) => ({ ...s, visible: s.id === 'summary' })),
        },
      },
      () => {},
    );
    setup();
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore default steps' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
  });
});
