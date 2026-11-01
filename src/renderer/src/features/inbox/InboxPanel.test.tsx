import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { anAccount, anAccountList, aPullRequestSummary } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { PlotError } from '../../lib/api';
import { InboxPanel } from './InboxPanel';

const signedIn = vi.fn().mockResolvedValue(anAccountList([anAccount('octocat')]));

const twoRepositories = [
  aPullRequestSummary(1, {
    ref: { host: 'github.com', owner: 'acme', repo: 'api', number: 1 },
    title: 'Fix login',
    updatedAt: '2026-10-02T00:00:00Z',
  }),
  aPullRequestSummary(2, {
    ref: { host: 'github.com', owner: 'acme', repo: 'web', number: 2 },
    title: 'Add dark mode',
    updatedAt: '2026-10-01T00:00:00Z',
  }),
];

describe('InboxPanel', () => {
  it('lists review requests and authored pull requests', async () => {
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      listAccounts: signedIn,
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(1, { title: 'Fix login' })],
        authored: [aPullRequestSummary(2, { title: 'Add cache', isDraft: true })],
      }),
    });

    const review = await screen.findByRole('region', { name: /Review requested/ });
    expect(within(review).getByText('Fix login')).toBeInTheDocument();
    expect(
      within(review).getByRole('button', { name: /octocat\/hello-world/, expanded: true }),
    ).toBeInTheDocument();

    const authored = screen.getByRole('region', { name: /Your pull requests/ });
    expect(within(authored).getByText('Add cache')).toBeInTheDocument();
    expect(within(authored).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('octocat')).toBeInTheDocument();
  });

  it('groups pull requests by repository and remembers the ones folded away', async () => {
    const api = {
      listAccounts: signedIn,
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: twoRepositories, authored: [] }),
    };
    const { unmount } = renderWithApi(<InboxPanel onSelect={vi.fn()} />, api);

    const review = await screen.findByRole('region', { name: /Review requested/ });
    expect(
      within(review)
        .getAllByRole('button', { expanded: true })
        .map((header) => header.textContent),
    ).toEqual(['acme/api1', 'acme/web1']);

    await userEvent.click(within(review).getByRole('button', { name: /acme\/api/ }));
    expect(within(review).getByRole('button', { name: /acme\/api/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Fix login')).not.toBeVisible();

    unmount();
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, api);
    expect(await screen.findByRole('button', { name: /acme\/api/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('filters by what is typed, even in folded repositories, and opens the first match', async () => {
    const onSelect = vi.fn();
    renderWithApi(<InboxPanel onSelect={onSelect} />, {
      listAccounts: signedIn,
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: twoRepositories, authored: [] }),
    });
    await userEvent.click(await screen.findByRole('button', { name: /acme\/web/ }));

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Find or open a pull request' }),
      'dark',
    );

    expect(screen.queryByText('Fix login')).not.toBeInTheDocument();
    expect(screen.getByText('Add dark mode')).toBeVisible();
    expect(screen.getByText('No pull requests match.')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'acme',
      repo: 'web',
      number: 2,
    });
  });

  it('selects a pull request when it is clicked', async () => {
    const onSelect = vi.fn();
    renderWithApi(<InboxPanel onSelect={onSelect} />, {
      listAccounts: signedIn,
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(7, { title: 'Fix login' })],
        authored: [],
      }),
    });

    await userEvent.click(await screen.findByRole('button', { name: /Fix login/ }));
    expect(onSelect).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'octocat',
      repo: 'hello-world',
      number: 7,
    });
  });

  it('marks the selected pull request', async () => {
    renderWithApi(
      <InboxPanel
        selected={{ host: 'github.com', owner: 'Octocat', repo: 'Hello-World', number: 7 }}
        onSelect={vi.fn()}
      />,
      {
        listAccounts: signedIn,
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
      listAccounts: signedIn,
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] }),
    });

    expect(await screen.findByText('Nothing is waiting for your review.')).toBeInTheDocument();
    expect(screen.getByText('You have no open pull requests.')).toBeInTheDocument();
  });

  it('offers the ways to connect GitHub before any account is connected', async () => {
    const listInbox = vi.fn();
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([])),
      listInbox,
    });

    expect(await screen.findByRole('heading', { name: 'Connect GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with your browser/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use the GitHub CLI/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Find or open a pull request' }),
    ).not.toBeInTheDocument();
    expect(listInbox).not.toHaveBeenCalled();
  });

  it('shows the current account and opens account settings from it', async () => {
    const onManageAccounts = vi.fn();
    renderWithApi(<InboxPanel onSelect={vi.fn()} onManageAccounts={onManageAccounts} />, {
      listAccounts: vi
        .fn()
        .mockResolvedValue(anAccountList([anAccount('mona', { host: 'github.example.com' })])),
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] }),
    });

    const account = await screen.findByRole('button', { name: /mona/ });
    expect(account).toHaveTextContent('github.example.com');
    await userEvent.click(account);
    expect(onManageAccounts).toHaveBeenCalledOnce();
  });

  it('opens shorthand references on the current account host', async () => {
    const onSelect = vi.fn();
    renderWithApi(<InboxPanel onSelect={onSelect} />, {
      listAccounts: vi
        .fn()
        .mockResolvedValue(anAccountList([anAccount('mona', { host: 'github.example.com' })])),
      listInbox: vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] }),
    });

    await userEvent.type(
      await screen.findByRole('searchbox', { name: 'Find or open a pull request' }),
      'platform/api#7{Enter}',
    );
    expect(onSelect).toHaveBeenCalledWith({
      host: 'github.example.com',
      owner: 'platform',
      repo: 'api',
      number: 7,
    });
  });

  it('shows inbox errors and recovers on retry', async () => {
    const listInbox = vi
      .fn()
      .mockRejectedValueOnce(new PlotError('network', 'Could not reach GitHub.'))
      .mockResolvedValue({ reviewRequested: [aPullRequestSummary(3)], authored: [] });
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, { listAccounts: signedIn, listInbox });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach GitHub.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pull request 3')).toBeInTheDocument();
  });

  it('refreshes both the accounts and the inbox from the header button', async () => {
    const listInbox = vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] });
    renderWithApi(<InboxPanel onSelect={vi.fn()} />, { listAccounts: signedIn, listInbox });

    await screen.findByText('Nothing is waiting for your review.');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(listInbox).toHaveBeenCalledTimes(2));
  });
});
