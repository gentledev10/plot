import type { ReviewMap, ReviewStatus } from '@shared/review';
import { BUILTIN_STEPS } from '@shared/review-plan';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { initializePreferences } from '../../lib/preferences';
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
  changes: [
    {
      title: 'Empty names',
      before: 'Every user saw "hello".',
      after: 'Users see "hello <name>", even when the name is empty.',
      location: { path: 'src/app.ts', line: 99, verified: false },
    },
    {
      title: 'Caller elsewhere',
      before: '',
      after: 'Another module now passes the name.',
      location: { path: 'src/other.ts', line: 3, verified: true },
    },
  ],
  flows: [
    {
      title: 'Greeting',
      before: [{ from: 'App', to: 'Greeter', label: 'greet()' }],
      after: [
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
    nodes: [{ id: 'app', label: 'App shell', status: 'changed' }],
    edges: [],
  },
  impacts: [{ area: 'Public greet API', detail: 'Callers must pass a name.' }],
  readingOrder: [{ path: 'src/app.ts', reason: 'Where the greeting changes.' }],
};

const done: ReviewStatus = {
  state: 'done',
  review,
  head: 'd'.repeat(40),
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  costUsd: 0.42,
};

function setup(statuses: ReviewStatus[], overrides = {}) {
  initializePreferences(
    {
      'review-plan': {
        version: 2,
        steps: BUILTIN_STEPS.map(({ id }) => ({
          id,
          kind: id,
          title: '',
          instructions: '',
          visible: true,
          detail: 'balanced',
          format: 'text',
        })),
      },
    },
    () => {},
  );
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
  it('keeps map scope and evidence available on demand and can enlarge the map', async () => {
    const enlarge = vi.fn();
    renderWithApi(
      <ReviewPanel target={target} onOpenLocation={() => {}} onToggleMaximize={enlarge} />,
      {
        getReviewStatus: vi.fn().mockResolvedValue({
          ...done,
          review: {
            ...review,
            architecture: {
              ...review.architecture,
              groups: [{ id: 'runtime', label: 'Runtime' }],
              summary: 'The runtime changes.',
              scope: 'README and runtime inspected.',
              nodes: [
                {
                  id: 'app',
                  label: 'App shell',
                  status: 'changed',
                  group: 'runtime',
                  evidence: 'code',
                  location: { path: 'src/app.ts', line: 2, verified: true },
                },
              ],
            },
          },
        }),
        getPullRequestDiff: vi.fn().mockResolvedValue(diff),
      },
    );
    await screen.findByText('The runtime changes.');
    expect(screen.getByText('README and runtime inspected.')).not.toBeVisible();
    await userEvent.click(screen.getByText('Components and analysis scope'));
    expect(screen.getByText('README and runtime inspected.')).toBeVisible();
    expect(screen.getByText('Code reference')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge map' }));
    expect(enlarge).toHaveBeenCalledOnce();
  });
  it('shows the five-step flow, actionable checks and progressively disclosed changes', async () => {
    renderWithApi(<ReviewPanel target={target} onOpenLocation={() => {}} />, {
      getReviewStatus: vi.fn().mockResolvedValue({
        ...done,
        review: {
          ...review,
          changes: Array.from({ length: 5 }, (_, i) => ({
            title: `Change ${i}`,
            before: 'Before',
            after: 'After',
          })),
          reviewPoints: [
            {
              title: 'Rollback behavior',
              reason: 'Stored state can differ',
              check: 'Inspect the migration test',
              evidence: 'inferred',
              location: { path: 'src/app.ts', line: 12, verified: true },
            },
          ],
        },
      }),
      getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    });
    await screen.findByText('Greets users by name.');
    expect(screen.getAllByRole('article').map((card) => card.dataset.stepId)).toEqual([
      'summary',
      'architecture',
      'changes',
      'reviewPoints',
      'readingOrder',
    ]);
    expect(screen.getAllByTestId('diagram')).toHaveLength(1);
    expect(screen.getByText('Inference — check this')).toBeInTheDocument();
    expect(screen.getByText('Check: Inspect the migration test')).toBeInTheDocument();
    expect(screen.queryByText('Change 4')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByText('Change 4')).toBeInTheDocument();
  });
  it('asks for a pull request when none is open', () => {
    renderWithApi(<ReviewPanel onOpenLocation={vi.fn()} />);
    expect(
      screen.getByText('Open a pull request to get an overview of its changes.'),
    ).toBeInTheDocument();
  });

  it('explains what will happen before generating, then starts a review', async () => {
    const { api } = setup([
      { state: 'idle' },
      { state: 'running', startedAt: new Date().toISOString(), activity: [] },
    ]);

    expect(
      await screen.findByText(/Claude Code reads this pull request .* read-only access/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Explain this change/ }));
    expect(api.startReview).toHaveBeenCalledWith(target);
    expect(await screen.findByText(/Reading the change…/)).toBeInTheDocument();
  });

  it('names the AI tool chosen in settings and links to the setting', async () => {
    const onConfigureAi = vi.fn();
    renderWithApi(
      <ReviewPanel target={target} onOpenLocation={vi.fn()} onConfigureAi={onConfigureAi} />,
      {
        getReviewStatus: vi.fn().mockResolvedValue({ state: 'idle' }),
        getPullRequestDiff: vi.fn().mockResolvedValue(diff),
        getAiSettings: vi.fn().mockResolvedValue({ provider: 'codex', models: {} }),
      },
    );

    expect(await screen.findByText(/Codex CLI reads this pull request/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose another AI tool' }));
    expect(onConfigureAi).toHaveBeenCalledOnce();
  });

  it('says which tool and model made a stored review', async () => {
    setup([
      {
        state: 'done',
        head: 'd'.repeat(40),
        createdAt: new Date().toISOString(),
        provider: 'codex',
        model: 'gpt-5.1-codex',
        review: {
          summary: 'S',
          changes: [],
          flows: [],
          architecture: { nodes: [], edges: [] },
          impacts: [],
          readingOrder: [],
        },
      },
    ]);
    expect(
      await screen.findByText('Generated by Codex CLI (gpt-5.1-codex) just now'),
    ).toBeInTheDocument();
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
    expect(latest.closest('[role="status"]')).toHaveTextContent('Reading the change…');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.cancelReview).toHaveBeenCalledWith(target);
  });

  it('shows the review with diagrams built from its structure', async () => {
    setup([done]);

    expect(await screen.findByText('Greets users by name.')).toBeInTheDocument();
    const [architecture, before, now] = screen.getAllByTestId('diagram');
    expect(before).toHaveTextContent('rect rgba(219, 92, 92, 0.18) p0->>p1: greet()');
    expect(now).toHaveTextContent('rect rgba(95, 184, 101, 0.2) p0->>p1: greet(name)');
    expect(architecture).toHaveTextContent('n0["App shell"]:::changed');
    expect(screen.getByText(/cost \$0\.42/)).toBeInTheDocument();
  });

  it('explains each change by how it worked before and how it works now', async () => {
    setup([done]);
    const change = (await screen.findByText('Empty names')).closest('li') as HTMLElement;
    expect(within(change).getByText('Before').nextSibling).toHaveTextContent(
      'Every user saw "hello".',
    );
    expect(within(change).getByText('Now')).toBeInTheDocument();

    const added = screen.getByText('Caller elsewhere').closest('li') as HTMLElement;
    expect(within(added).queryByText('Before')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What else it affects' })).toBeInTheDocument();
    expect(screen.getByText('Callers must pass a name.')).toBeInTheDocument();
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
    const change = (await screen.findByText('Empty names')).closest('li');
    expect(change).not.toBeNull();
    expect(within(change as HTMLElement).getByText('unverified')).toBeInTheDocument();
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
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Generate again' })[0] as HTMLElement,
    );
    expect(api.startReview).toHaveBeenCalledWith(target);
  });
});
