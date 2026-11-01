import type { Account } from '@shared/accounts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anAccount, anAccountList } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { PlotError } from '../../lib/api';
import { ConnectGitHub } from './ConnectGitHub';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const signIn = {
  id: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresAt: '2026-10-31T00:15:00Z',
};

function setup(api: Parameters<typeof renderWithApi>[1] = {}) {
  const onConnected = vi.fn();
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const rendered = renderWithApi(<ConnectGitHub onConnected={onConnected} />, {
    listAccounts: vi.fn().mockResolvedValue(anAccountList([])),
    ...api,
  });
  return { ...rendered, onConnected, open };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConnectGitHub', () => {
  it('connects with a personal access token', async () => {
    const account = anAccount('mona', { method: 'token' });
    const signInWithToken = vi.fn().mockResolvedValue(account);
    const { onConnected } = setup({ signInWithToken });

    await userEvent.click(
      await screen.findByRole('button', { name: /Use a personal access token/ }),
    );
    await userEvent.type(screen.getByLabelText('Personal access token'), ' ghp_abc123 ');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(signInWithToken).toHaveBeenCalledWith({ host: 'github.com', token: 'ghp_abc123' });
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith(account));
    expect(screen.getByRole('link', { name: 'Create a classic token' })).toHaveAttribute(
      'href',
      'https://github.com/settings/tokens/new?scopes=repo&description=Plot',
    );
  });

  it('shows why GitHub rejected a token', async () => {
    setup({
      signInWithToken: vi
        .fn()
        .mockRejectedValue(new PlotError('github-unauthorized', 'Bad credentials.')),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: /Use a personal access token/ }),
    );
    await userEvent.type(screen.getByLabelText('Personal access token'), 'ghp_wrong{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Bad credentials.');
  });

  it('points GitHub Enterprise Cloud accounts to GitHub.com', async () => {
    setup();
    expect(await screen.findByRole('radio', { name: 'GitHub.com' })).toHaveAccessibleDescription(
      'Including GitHub Enterprise Cloud',
    );
    expect(screen.getByRole('radio', { name: 'Company server' })).toHaveAccessibleDescription(
      'GitHub Enterprise Server or GHE.com',
    );
  });

  it('connects to a company server through the GitHub CLI', async () => {
    const signInWithGitHubCli = vi
      .fn()
      .mockResolvedValue(anAccount('mona', { host: 'github.example.com' }));
    setup({ signInWithGitHubCli });

    await userEvent.click(await screen.findByRole('radio', { name: 'Company server' }));
    expect(
      screen.queryByRole('button', { name: /Sign in with your browser/ }),
    ).not.toBeInTheDocument();
    const cli = screen.getByRole('button', { name: /Use the GitHub CLI/ });
    expect(cli).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Server address'), 'https://GitHub.Example.com/');
    expect(
      screen.getByText('gh auth login --hostname github.example.com --web'),
    ).toBeInTheDocument();
    await userEvent.click(cli);

    expect(signInWithGitHubCli).toHaveBeenCalledWith('github.example.com');
  });

  it('copies the command that signs in to a company server with the GitHub CLI', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('radio', { name: 'Company server' }));
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy).toBeDisabled();

    await user.type(screen.getByLabelText('Server address'), 'github.example.com');
    await user.click(copy);

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'gh auth login --hostname github.example.com --web',
    );
  });

  it('opens GitHub in the browser with the one-time code', async () => {
    const account = anAccount('mona');
    const finish = deferred<Account>();
    const finishBrowserSignIn = vi.fn().mockReturnValue(finish.promise);
    const { onConnected, open } = setup({
      startBrowserSignIn: vi.fn().mockResolvedValue(signIn),
      finishBrowserSignIn,
    });
    const devicePage = 'https://github.com/login/device?user_code=WDJB-MJHT';

    await userEvent.click(await screen.findByRole('button', { name: /Sign in with your browser/ }));

    expect(await screen.findByLabelText('Sign-in code')).toHaveTextContent('WDJB-MJHT');
    expect(open).toHaveBeenCalledWith(devicePage, '_blank', 'noreferrer');
    expect(finishBrowserSignIn).toHaveBeenCalledWith(signIn.id);
    await userEvent.click(screen.getByRole('button', { name: 'Copy code and open GitHub' }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith(devicePage, '_blank', 'noreferrer');

    finish.resolve(account);
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith(account));
  });

  it('cancels a browser sign-in', async () => {
    const cancelBrowserSignIn = vi.fn().mockResolvedValue(undefined);
    setup({
      startBrowserSignIn: vi.fn().mockResolvedValue(signIn),
      finishBrowserSignIn: vi.fn().mockReturnValue(new Promise(() => {})),
      cancelBrowserSignIn,
    });

    await userEvent.click(await screen.findByRole('button', { name: /Sign in with your browser/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(cancelBrowserSignIn).toHaveBeenCalledWith(signIn.id);
    expect(screen.getByRole('button', { name: /Sign in with your browser/ })).toBeEnabled();
  });

  it('reports a browser sign-in that GitHub ended', async () => {
    setup({
      startBrowserSignIn: vi.fn().mockResolvedValue(signIn),
      finishBrowserSignIn: vi
        .fn()
        .mockRejectedValue(new PlotError('sign-in-failed', 'The sign-in code expired.')),
    });

    await userEvent.click(await screen.findByRole('button', { name: /Sign in with your browser/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The sign-in code expired.');
  });

  it('hides browser sign-in when this build cannot offer it', async () => {
    setup({
      listAccounts: vi.fn().mockResolvedValue({ accounts: [], browserSignIn: false }),
    });
    expect(await screen.findByRole('button', { name: /Use the GitHub CLI/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Sign in with your browser/ }),
    ).not.toBeInTheDocument();
  });
});
