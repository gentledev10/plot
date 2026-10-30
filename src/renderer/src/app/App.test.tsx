import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail, aPullRequestSummary, aUser } from '../../test/builders';
import { renderWithApi } from '../../test/render';
import { App } from './App';

describe('App', () => {
  it('opens the pull request picked in the inbox', async () => {
    const getPullRequest = vi
      .fn()
      .mockResolvedValue(aPullRequestDetail({ title: 'Fix login redirect' }));
    renderWithApi(<App platform="darwin" />, {
      getSession: vi.fn().mockResolvedValue({ status: 'signed-in', user: aUser() }),
      listInbox: vi.fn().mockResolvedValue({
        reviewRequested: [aPullRequestSummary(42, { title: 'Fix login redirect' })],
        authored: [],
      }),
      getPullRequest,
    });

    expect(screen.getByText('Select a pull request to start reviewing.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));

    expect(
      await screen.findByRole('heading', { name: 'Fix login redirect', level: 1 }),
    ).toBeInTheDocument();
    expect(getPullRequest).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('opens a pull request pasted as a URL', async () => {
    const getPullRequest = vi.fn().mockResolvedValue(aPullRequestDetail({ title: 'From a link' }));
    renderWithApi(<App platform="darwin" />, {
      getSession: vi.fn().mockResolvedValue({ status: 'signed-out' }),
      getPullRequest,
    });

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Pull request URL' }),
      'https://github.com/acme/api/pull/9{Enter}',
    );

    expect(await screen.findByRole('heading', { name: 'From a link' })).toBeInTheDocument();
    expect(getPullRequest).toHaveBeenCalledWith({ owner: 'acme', repo: 'api', number: 9 });
  });
});
