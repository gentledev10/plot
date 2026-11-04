import type { LocalTarget } from '@shared/local';
import type { ReviewStatus } from '@shared/review';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { LocalReviewPanel } from './LocalReviewPanel';

const target: LocalTarget = { repositoryId: 'a'.repeat(16), compare: 'uncommitted' };
const files = [
  {
    path: 'app.ts',
    kind: 'file' as const,
    status: 'modified' as const,
    oldBlob: 'b'.repeat(40),
    newBlob: null,
    additions: 1,
    deletions: 1,
  },
];
const done: ReviewStatus = {
  state: 'done',
  head: 'exact-content-signature',
  language: 'en',
  createdAt: '2026-11-03T00:00:00Z',
  provider: 'codex',
  model: 'fake-agent-fixture',
  review: {
    summary: 'Synthetic overview fixture.',
    changes: [
      {
        title: 'Synthetic change',
        before: 'Before',
        after: 'After',
        location: { path: 'app.ts', line: 1, verified: true },
      },
    ],
    flows: [],
    architecture: { nodes: [], edges: [] },
    impacts: [],
    readingOrder: [],
  },
};
it('does not request a local overview status for an empty commit selection', async () => {
  const getLocalReviewStatus = vi.fn(async () => ({ state: 'idle' as const }));
  renderWithApi(
    <LocalReviewPanel
      target={{ ...target, compare: 'commits', commits: [] }}
      files={[]}
      onOpenLocation={() => {}}
    />,
    { getLocalReviewStatus },
  );
  expect(screen.getByRole('button', { name: 'Explain local changes' })).toBeDisabled();
  await act(async () => {});
  expect(getLocalReviewStatus).not.toHaveBeenCalled();
  expect(screen.getByText('No changes')).toBeInTheDocument();
});

it('discloses selected local code is sent to the chosen provider and generates only after an explicit click', async () => {
  const startLocalReview = vi.fn(async () => {});
  const { api } = renderWithApi(
    <LocalReviewPanel target={target} files={files} onOpenLocation={() => {}} />,
    {
      getLocalReviewStatus: vi.fn(async () => ({ state: 'idle' as const })),
      startLocalReview,
      getAiSettings: vi.fn(async () => ({
        provider: 'codex' as const,
        models: {},
        efforts: {},
        auth: {},
      })),
    },
  );
  expect(
    await screen.findByText(/selected local diff and file contents.*sent.*Codex CLI/),
  ).toBeInTheDocument();
  expect(startLocalReview).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Explain local changes' }));
  expect(startLocalReview).toHaveBeenCalledWith(target);
  expect(api.getReviewStatus).not.toHaveBeenCalled();
  expect(api.startReview).not.toHaveBeenCalled();
});

it('renders the existing overview cards with local code links and no PR execution actions', async () => {
  const onOpenLocation = vi.fn();
  renderWithApi(
    <LocalReviewPanel target={target} files={files} onOpenLocation={onOpenLocation} />,
    { getLocalReviewStatus: vi.fn(async () => done) },
  );
  expect(await screen.findByText('Synthetic overview fixture.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Key changes/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'app.ts' }));
  expect(onOpenLocation).toHaveBeenCalledWith({ path: 'app.ts', line: 1, verified: true });
  expect(screen.queryByRole('button', { name: /Run scenario/ })).not.toBeInTheDocument();
});
it('exposes progress, cancellation and retryable failures through local-only methods', async () => {
  const getLocalReviewStatus = vi.fn().mockResolvedValue({
    state: 'running',
    startedAt: '2026-11-03T00:00:00Z',
    activity: ['Reading selected snapshot'],
  });
  const cancelLocalReview = vi.fn(async () => {});
  renderWithApi(<LocalReviewPanel target={target} files={files} onOpenLocation={() => {}} />, {
    getLocalReviewStatus,
    cancelLocalReview,
  });
  expect(await screen.findByText('Reading selected snapshot')).toBeInTheDocument();
  getLocalReviewStatus.mockResolvedValue({
    state: 'failed',
    error: { code: 'ai-failed', message: 'Fake-agent fixture failure.' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancelLocalReview).toHaveBeenCalledWith(target);
  expect(await screen.findByText('Fake-agent fixture failure.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Explain local changes' })).toBeEnabled();
});
function Harness() {
  const [signature, setSignature] = useState('before');
  return (
    <>
      <button type="button" onClick={() => setSignature('after')}>
        Change fixture signature
      </button>
      <LocalReviewPanel
        target={target}
        files={files}
        signature={signature}
        onOpenLocation={() => {}}
      />
    </>
  );
}
it('immediately hides a previous overview when the polled working-tree signature changes', async () => {
  const getLocalReviewStatus = vi.fn().mockResolvedValue(done);

  renderWithApi(<Harness />, { getLocalReviewStatus });
  expect(await screen.findByText('Synthetic overview fixture.')).toBeInTheDocument();
  getLocalReviewStatus.mockImplementation(() => new Promise(() => {}));
  await userEvent.click(screen.getByRole('button', { name: 'Change fixture signature' }));
  expect(screen.queryByText('Synthetic overview fixture.')).not.toBeInTheDocument();
});

it('hides a saved overview when revalidation fails instead of presenting stale code as current', async () => {
  const getLocalReviewStatus = vi.fn().mockResolvedValue(done);
  const { queryClient } = renderWithApi(
    <LocalReviewPanel target={target} files={files} onOpenLocation={() => {}} />,
    { getLocalReviewStatus },
  );
  await screen.findByText('Synthetic overview fixture.');
  getLocalReviewStatus.mockRejectedValue(new Error('Fixture source is no longer readable.'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['local-review'] });
  });
  expect(await screen.findByText('Fixture source is no longer readable.')).toBeInTheDocument();
  expect(screen.queryByText('Synthetic overview fixture.')).not.toBeInTheDocument();
});
