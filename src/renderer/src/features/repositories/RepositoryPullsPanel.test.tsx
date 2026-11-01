import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestSummary, aUser } from '../../../test/builders';
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
    expect(listRepositoryPullRequests).toHaveBeenLastCalledWith({ repository: api, page: 2 });

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
});
