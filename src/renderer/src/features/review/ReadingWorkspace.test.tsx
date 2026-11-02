import type { ReviewStatus } from '@shared/review';
import { retryUnit } from '@shared/review-unit.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { PullRequestWorkspace } from '../pull-request/PullRequestWorkspace';
import { ReviewPanel } from './ReviewPanel';

vi.mock('../pull-request/PullRequestHeader', () => ({
  PullRequestHeader: () => <div>PR header</div>,
}));
vi.mock('../diff/FileDiff', () => ({
  FileDiff: ({ file }: { file: { path: string } }) => (
    <pre data-testid="file-content">{file.path}</pre>
  ),
}));
const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const files = ['src/retry.ts', 'src/retry.test.ts', 'README.md'].map((path) => ({
  path,
  status: 'modified' as const,
  kind: 'file' as const,
  additions: 1,
  deletions: 1,
  oldBlob: null,
  newBlob: null,
}));
function Harness() {
  const [path, select] = useState<string>();
  return (
    <>
      <PullRequestWorkspace target={ref} selectedPath={path} onSelectPath={select} />
      <ReviewPanel target={ref} onOpenLocation={(location) => select(location.path)} />
    </>
  );
}
const done: ReviewStatus = {
  state: 'done',
  head: 'a'.repeat(40),
  createdAt: new Date().toISOString(),
  review: {
    summary: 'Reliable delivery.',
    changes: [{ title: 'Temporary failures', before: 'Stops.', after: 'Retries.' }],
    units: [retryUnit()],
    architecture: { nodes: [], edges: [] },
    flows: [],
    impacts: [],
    readingOrder: [],
  },
};
describe('semantic reading workspace', () => {
  it('selects a purpose unit, keeps its tests beside implementation, and exposes files outside it', async () => {
    const user = userEvent.setup();
    renderWithApi(<Harness />, {
      getReviewStatus: vi.fn().mockResolvedValue(done),
      getPullRequestDiff: vi
        .fn()
        .mockResolvedValue({ files, head: done.head, mergeBase: 'b'.repeat(40) }),
    });
    expect(await screen.findByRole('heading', { name: 'Retry temporary failures' })).toBeVisible();
    expect(screen.getByTestId('file-content')).toHaveTextContent('src/retry.ts');
    expect(screen.getByText('These test files are reading links, not test results.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Test src/retry.test.ts' }));
    expect(screen.getByTestId('file-content')).toHaveTextContent('src/retry.test.ts');
    await user.selectOptions(screen.getByLabelText('Read by change'), 'remaining');
    expect(screen.getByTestId('file-content')).toHaveTextContent('README.md');
    await user.selectOptions(screen.getByLabelText('Read by change'), 'all');
    expect(screen.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  });
  it('does not connect review units to diffs from another revision', async () => {
    renderWithApi(<Harness />, {
      getReviewStatus: vi.fn().mockResolvedValue(done),
      getPullRequestDiff: vi
        .fn()
        .mockResolvedValue({ files, head: 'c'.repeat(40), mergeBase: 'b'.repeat(40) }),
    });
    await screen.findByTestId('file-content');
    expect(screen.queryByLabelText('Read by change')).not.toBeInTheDocument();
  });
});
