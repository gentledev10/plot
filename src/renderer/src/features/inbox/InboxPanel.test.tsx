import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestSummary, aUser } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { ViewerError } from '../../lib/api';
import { InboxPanel } from './InboxPanel';

const signedIn = vi.fn().mockResolvedValue({ status: 'signed-in', user: aUser('octocat') });

describe('InboxPanel', () => {
  it('lists review requests and authored pull requests', async () => {
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      getSession: signedIn,
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(1, { title: 'Fix login' })],
        authored: [aPullRequestSummary(2, { title: 'Add cache', isDraft: true })],
      }),
    });

    const review = await screen.findByRole('region', { name: /Review requested/ });
    expect(within(review).getByText('Fix login')).toBeInTheDocument();
    expect(within(review).getByText('1')).toBeInTheDocument();

    const authored = screen.getByRole('region', { name: /Your pull requests/ });
    expect(within(authored).getByText('Add cache')).toBeInTheDocument();
    expect(within(authored).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('octocat')).toBeInTheDocument();
  });

  it('selects a pull request when it is clicked', async () => {
    const onSelect = vi.fn();
    renderWithApi(<InboxPanel onSelect={onSelect} />, {
      getSession: signedIn,
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(7, { title: 'Fix login' })],
        authored: [],
      }),
    });

    await userEvent.click(await screen.findByRole('button', { name: /Fix login/ }));
    expect(onSelect).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', number: 7 });
  });

  it('marks the selected pull request', async () => {
    renderWithApi(
      <InboxPanel
        selected={{ owner: 'Octocat', repo: 'Hello-World', number: 7 }}
        onSelect={vi.fn()}
      />,
      {
        getSession: signedIn,
        listInbox: vi.fn().mockResolvedValue({
          reviewRequested: [aPullRequestSummary(7, { title: 'Fix login' })],
          authored: [aPullRequestSummary(8, { title: 'Other' })],
        }),
      },
    );

    expect(await screen.findByRole('button', { name: /Fix login/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Other/ })).not.toHaveAttribute('aria-current');
  });

  it('says so when both lists are empty', async () => {
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      getSession: signedIn,
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] }),
    });

    expect(await screen.findByText('Nothing is waiting for your review.')).toBeInTheDocument();
    expect(screen.getByText('You have no open pull requests.')).toBeInTheDocument();
  });

  it('explains how to install gh when it is missing', async () => {
    const listInbox = vi.fn();
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      getSession: vi.fn().mockResolvedValue({ status: 'gh-not-installed' }),
      listInbox,
    });

    expect(await screen.findByText('Install the GitHub CLI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'cli.github.com' })).toHaveAttribute(
      'href',
      'https://cli.github.com',
    );
    expect(listInbox).not.toHaveBeenCalled();
  });

  it('asks to sign in with gh and checks again on retry', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ status: 'signed-out' })
      .mockResolvedValue({ status: 'signed-in', user: aUser() });
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      getSession,
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(1, { title: 'Fix login' })],
        authored: [],
      }),
    });

    expect(await screen.findByText('Sign in to GitHub')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Fix login')).toBeInTheDocument();
  });

  it('shows inbox errors and recovers on retry', async () => {
    const listInbox = vi
      .fn()
      .mockRejectedValueOnce(new ViewerError('network', 'Could not reach GitHub.'))
      .mockResolvedValue({ reviewRequested: [aPullRequestSummary(3)], authored: [] });
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, { getSession: signedIn, listInbox });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach GitHub.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pull request 3')).toBeInTheDocument();
  });

  it('refreshes both the session and the inbox from the header button', async () => {
    const listInbox = vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] });
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, { getSession: signedIn, listInbox });

    await screen.findByText('Nothing is waiting for your review.');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(listInbox).toHaveBeenCalledTimes(2));
  });
});
