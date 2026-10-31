import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { ViewerError } from '../../lib/api';
import { PullRequestHeader } from './PullRequestHeader';

const target = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

describe('PullRequestHeader', () => {
  it('shows the title, branches, and size of the change', async () => {
    renderWithApi(<PullRequestHeader target={target} />, {
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

  it('keeps the description folded until asked', async () => {
    renderWithApi(<PullRequestHeader target={target} />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail({ body: 'Adds a dark theme.' })),
    });

    const toggle = await screen.findByRole('button', { name: 'Description' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Adds a dark theme.')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Adds a dark theme.')).toBeInTheDocument();
  });

  it('hides the description toggle when there is no description', async () => {
    renderWithApi(<PullRequestHeader target={target} />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail({ body: '  \n' })),
    });
    await screen.findByRole('heading', { name: 'Add dark mode' });
    expect(screen.queryByRole('button', { name: 'Description' })).not.toBeInTheDocument();
  });

  it('shows the description as plain text, never as HTML', async () => {
    renderWithApi(<PullRequestHeader target={target} />, {
      getPullRequest: vi
        .fn()
        .mockResolvedValue(aPullRequestDetail({ body: '<img src=x onerror=alert(1)> hello' })),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Description' }));
    expect(screen.getByText('<img src=x onerror=alert(1)> hello')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it.each([
    [{ state: 'merged' as const }, 'Merged'],
    [{ state: 'closed' as const }, 'Closed'],
    [{ isDraft: true }, 'Draft'],
  ])('labels %o pull requests as %s', async (overrides, label) => {
    renderWithApi(<PullRequestHeader target={target} />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail(overrides)),
    });
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('shows the error and retries', async () => {
    const getPullRequest = vi
      .fn()
      .mockRejectedValueOnce(new ViewerError('network', 'Could not reach GitHub.'))
      .mockResolvedValue(aPullRequestDetail());
    renderWithApi(<PullRequestHeader target={target} />, { getPullRequest });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach GitHub.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Add dark mode' })).toBeInTheDocument();
  });
});
