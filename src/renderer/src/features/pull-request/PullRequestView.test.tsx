import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { ViewerError } from '../../lib/api';
import { PullRequestView } from './PullRequestView';

const target = { owner: 'octocat', repo: 'hello-world', number: 42 };

describe('PullRequestView', () => {
  it('shows the title, branches, and size of the change', async () => {
    renderWithApi(<PullRequestView target={target} />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail()),
    });

    expect(await screen.findByRole('heading', { name: 'Add dark mode' })).toBeInTheDocument();
    expect(screen.getByText('dark-mode')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.getByText('−8')).toBeInTheDocument();
    expect(screen.getByText('6 files')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat/hello-world/pull/42',
    );
  });

  it('shows the description as plain text, never as HTML', async () => {
    renderWithApi(<PullRequestView target={target} />, {
      getPullRequest: vi
        .fn()
        .mockResolvedValue(aPullRequestDetail({ body: '<img src=x onerror=alert(1)> hello' })),
    });

    expect(await screen.findByText('<img src=x onerror=alert(1)> hello')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it.each([
    [{ state: 'merged' as const }, 'Merged'],
    [{ state: 'closed' as const }, 'Closed'],
    [{ isDraft: true }, 'Draft'],
  ])('labels %o pull requests as %s', async (overrides, label) => {
    renderWithApi(<PullRequestView target={target} />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail(overrides)),
    });
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('shows the error and retries', async () => {
    const getPullRequest = vi
      .fn()
      .mockRejectedValueOnce(new ViewerError('network', 'Could not reach GitHub.'))
      .mockResolvedValue(aPullRequestDetail());
    renderWithApi(<PullRequestView target={target} />, { getPullRequest });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach GitHub.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Add dark mode' })).toBeInTheDocument();
  });
});
