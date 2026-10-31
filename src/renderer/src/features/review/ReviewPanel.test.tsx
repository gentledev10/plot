import type { ReviewMap, ReviewStatus } from '@shared/review';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { ReviewPanel } from './ReviewPanel';

vi.mock('./MermaidDiagram', () => ({
  MermaidDiagram: ({ source, label }: { source: string; label: string }) => (
    <pre data-testid="diagram" data-label={label}>
      {source}
    </pre>
  ),
}));

const target = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

const diff = {
  mergeBase: 'c'.repeat(40),
  head: 'd'.repeat(40),
  files: [
    {
      path: 'src/app.ts',
      status: 'modified' as const,
      kind: 'file' as const,
      oldBlob: 'a'.repeat(40),
      newBlob: 'b'.repeat(40),
      additions: 1,
      deletions: 1,
    },
  ],
};

const review: ReviewMap = {
  summary: 'Greets users by name.',
  readingOrder: [{ path: 'src/app.ts', reason: 'Where the greeting changes.' }],
  flows: [
    {
      title: 'Greeting',
      steps: [
        {
          from: 'App',
          to: 'Greeter',
          label: 'greet(name)',
          location: { path: 'src/app.ts', line: 12, verified: true },
        },
      ],
    },
  ],
  architecture: {
    nodes: [{ id: 'app', label: 'App shell', changed: true }],
    edges: [],
  },
  risks: [
    {
      title: 'Empty names',
      detail: 'An empty name prints "hello ".',
      severity: 'medium',
      location: { path: 'src/app.ts', line: 99, verified: false },
    },
    {
      title: 'Caller elsewhere',
      detail: 'A caller in another module was not updated.',
      severity: 'high',
      location: { path: 'src/other.ts', line: 3, verified: true },
    },
  ],
};

const done: ReviewStatus = {
  state: 'done',
  review,
  head: 'd'.repeat(40),
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  costUsd: 0.42,
};

function setup(statuses: ReviewStatus[], overrides = {}) {
  const getReviewStatus = vi.fn();
  for (const status of statuses.slice(0, -1)) {
    getReviewStatus.mockResolvedValueOnce(status);
  }
  getReviewStatus.mockResolvedValue(statuses.at(-1));
  const onOpenLocation = vi.fn();
  const result = renderWithApi(<ReviewPanel target={target} onOpenLocation={onOpenLocation} />, {
    getReviewStatus,
    getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    startReview: vi.fn().mockResolvedValue(undefined),
    cancelReview: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
  return { ...result, onOpenLocation };
}

describe('ReviewPanel', () => {
  it('asks for a pull request when none is open', () => {
    renderWithApi(<ReviewPanel onOpenLocation={vi.fn()} />);
    expect(screen.getByText('Open a pull request to generate a review map.')).toBeInTheDocument();
  });

  it('explains what will happen before generating, then starts a review', async () => {
    const { api } = setup([
      { state: 'idle' },
      { state: 'running', startedAt: new Date().toISOString(), activity: [] },
    ]);

    expect(await screen.findByText(/read-only tools/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Generate review map/ }));
    expect(api.startReview).toHaveBeenCalledWith(target);
    expect(await screen.findByText(/Reviewing…/)).toBeInTheDocument();
  });

  it('shows what the agent is doing and can cancel it', async () => {
    const { api } = setup([
      {
        state: 'running',
        startedAt: new Date().toISOString(),
        activity: ['Reading pull-request.diff', 'Reading src/app.ts'],
      },
    ]);

    const latest = await screen.findByText('Reading src/app.ts');
    expect(latest.closest('[role="status"]')).toHaveTextContent('Reviewing…');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.cancelReview).toHaveBeenCalledWith(target);
  });

  it('shows the review with diagrams built from its structure', async () => {
    setup([done]);

    expect(await screen.findByText('Greets users by name.')).toBeInTheDocument();
    const [flow, architecture] = screen.getAllByTestId('diagram');
    expect(flow).toHaveTextContent('p0->>p1: greet(name)');
    expect(architecture).toHaveTextContent('n0["App shell"]:::changed');
    expect(screen.getByText(/cost \$0\.42/)).toBeInTheDocument();
  });

  it('opens code locations in changed files', async () => {
    const { onOpenLocation } = setup([done]);

    await userEvent.click(await screen.findByRole('button', { name: 'src/app.ts:12' }));
    expect(onOpenLocation).toHaveBeenCalledWith({ path: 'src/app.ts', line: 12, verified: true });

    await userEvent.click(screen.getByRole('button', { name: 'src/app.ts' }));
    expect(onOpenLocation).toHaveBeenLastCalledWith({
      path: 'src/app.ts',
      line: 1,
      verified: true,
    });
  });

  it('flags locations the AI made up', async () => {
    setup([done]);
    const risk = (await screen.findByText('Empty names')).closest('li');
    expect(risk).not.toBeNull();
    expect(within(risk as HTMLElement).getByText('unverified')).toBeInTheDocument();
  });

  it('shows locations outside the pull request as text, not links', async () => {
    setup([done]);
    expect(await screen.findByText('src/other.ts:3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'src/other.ts:3' })).not.toBeInTheDocument();
  });

  it('shows failures and tries again', async () => {
    const { api } = setup([
      {
        state: 'failed',
        error: { code: 'ai-not-installed', message: 'Claude Code is not installed.' },
      },
    ]);
    expect(await screen.findByText('Claude Code is not installed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(api.startReview).toHaveBeenCalledWith(target);
  });

  it('regenerates a finished review on request', async () => {
    const { api } = setup([done]);
    await screen.findByText('Greets users by name.');
    await userEvent.click(screen.getByRole('button', { name: 'Generate again' }));
    expect(api.startReview).toHaveBeenCalledWith(target);
  });
});
