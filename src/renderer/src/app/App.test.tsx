import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail, aPullRequestSummary, aUser } from '../../test/builders';
import { renderWithApi } from '../../test/render';
import { App } from './App';

vi.mock('../features/diff/DiffViewer', () => import('../../test/fake-diff-viewer'));

const diff = {
  mergeBase: 'c'.repeat(40),
  head: 'd'.repeat(40),
  files: [
    {
      path: 'src/login.ts',
      status: 'modified' as const,
      kind: 'file' as const,
      oldBlob: 'a'.repeat(40),
      newBlob: 'b'.repeat(40),
      additions: 4,
      deletions: 1,
    },
  ],
};

function api() {
  return {
    getSession: vi.fn().mockResolvedValue({ status: 'signed-in', user: aUser() }),
    listInbox: vi.fn().mockResolvedValue({
      reviewRequested: [aPullRequestSummary(42, { title: 'Fix login redirect' })],
      authored: [],
    }),
    getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail({ title: 'Fix login redirect' })),
    getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    readBlob: vi.fn().mockResolvedValue({ kind: 'text', text: 'export {}' }),
  };
}

describe('App', () => {
  it('opens a pull request from the inbox and shows its changed files', async () => {
    const fake = api();
    renderWithApi(<App platform="darwin" />, fake);

    expect(screen.getByText('Select a pull request to start reviewing.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));

    expect(
      await screen.findByRole('heading', { name: 'Fix login redirect', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: /login\.ts/ })).toBeInTheDocument();
    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-path', 'src/login.ts');
    expect(fake.getPullRequestDiff).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('returns to the inbox and keeps the last pull request highlighted', async () => {
    renderWithApi(<App platform="darwin" />, api());

    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Pull requests/ }));

    expect(await screen.findByRole('button', { name: /Fix login redirect/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('Select a pull request to start reviewing.')).toBeInTheDocument();
  });

  it('opens a pull request pasted as a URL', async () => {
    const fake = { ...api(), getSession: vi.fn().mockResolvedValue({ status: 'signed-out' }) };
    renderWithApi(<App platform="darwin" />, fake);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Pull request URL' }),
      'https://github.com/acme/api/pull/9{Enter}',
    );

    expect(await screen.findByRole('heading', { name: 'Fix login redirect' })).toBeInTheDocument();
    expect(fake.getPullRequest).toHaveBeenCalledWith({ owner: 'acme', repo: 'api', number: 9 });
  });
});
