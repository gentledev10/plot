import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { anAccountList, aPullRequestSummary, aUser } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { PlotError } from '../../lib/api';
import { RepositoryPullsPanel } from './RepositoryPullsPanel';

const api = { host: 'github.com', owner: 'acme', repo: 'api' };

function pulls(from: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    aPullRequestSummary(from - index, { author: aUser('mona') }),
  );
}

describe('RepositoryPullsPanel', () => {
  it('lists the open pull requests with their authors and loads more on request', async () => {
    const listRepositoryPullRequests = vi.fn(async ({ page }: { page: number }) =>
      page === 1
        ? { pullRequests: pulls(40, 30), total: 32 }
        : { pullRequests: pulls(10, 2), total: 32 },
    );
    const onSelect = vi.fn();
    renderWithApi(<RepositoryPullsPanel repository={api} onSelect={onSelect} onBack={vi.fn()} />, {
      listRepositoryPullRequests,
    });

    expect(await screen.findByText('#40 by mona')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('#9 by mona')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(listRepositoryPullRequests).toHaveBeenLastCalledWith({
      repository: api,
      state: 'open',
      scope: 'everyone',
      text: '',
      page: 2,
    });
    expect(screen.getByText('32 pull requests')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /Pull request 9/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ number: 9 }));
  });

  it('says when nothing is open and goes back to the list', async () => {
    const onBack = vi.fn();
    renderWithApi(<RepositoryPullsPanel repository={api} onSelect={vi.fn()} onBack={onBack} />, {
      listRepositoryPullRequests: vi.fn().mockResolvedValue({ pullRequests: [], total: 0 }),
    });

    expect(await screen.findByText('No open pull requests.')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'acme/api' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back to pull requests' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows why the pull requests could not be loaded', async () => {
    renderWithApi(<RepositoryPullsPanel repository={api} onSelect={vi.fn()} onBack={vi.fn()} />, {
      listRepositoryPullRequests: vi
        .fn()
        .mockRejectedValue(new PlotError('github-rate-limited', 'GitHub rate limit reached.')),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub rate limit reached.');
  });

  it('filters by state and by whose pull requests they are, and searches on Enter', async () => {
    const listRepositoryPullRequests = vi.fn(async ({ state }: { state: string }) =>
      state === 'merged'
        ? {
            pullRequests: [
              aPullRequestSummary(5, { ref: { ...api, number: 5 }, state: 'merged' }),
              aPullRequestSummary(4, { ref: { ...api, number: 4 }, state: 'closed' }),
            ],
            total: 2,
          }
        : { pullRequests: [], total: 0 },
    );
    renderWithApi(<RepositoryPullsPanel repository={api} onSelect={vi.fn()} onBack={vi.fn()} />, {
      listRepositoryPullRequests,
    });
    expect(await screen.findByText('No open pull requests.')).toBeVisible();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'Merged');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Pull request scope' }),
      'Created by me',
    );
    const merged = await screen.findByRole('button', { name: /^#5/ });
    expect(within(merged).getByText('Merged')).toBeVisible();
    expect(within(screen.getByRole('button', { name: /^#4/ })).getByText('Closed')).toBeVisible();
    expect(listRepositoryPullRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'merged', scope: 'authored', text: '' }),
    );

    const search = screen.getByRole('searchbox', { name: 'Search pull requests in acme/api' });
    await userEvent.type(search, 'label:bug');
    expect(listRepositoryPullRequests).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'label:bug' }),
    );
    await userEvent.type(search, '{Enter}');
    expect(listRepositoryPullRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'label:bug' }),
    );
    await userEvent.clear(search);
    expect(listRepositoryPullRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '' }),
    );
  });

  it('marks the pull requests that wait for your review', async () => {
    const waiting = aPullRequestSummary(8, { ref: { ...api, number: 8 } });
    renderWithApi(<RepositoryPullsPanel repository={api} onSelect={vi.fn()} onBack={vi.fn()} />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList()),
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: [waiting], authored: [] }),
      listRepositoryPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [waiting, aPullRequestSummary(9, { ref: { ...api, number: 9 } })],
        total: 2,
      }),
    });

    const row = await screen.findByRole('button', { name: /^#8/ });
    expect(await within(row).findByText('Review requested')).toBeVisible();
    expect(screen.getByRole('button', { name: /^#9/ })).not.toHaveTextContent('Review requested');
  });
});
