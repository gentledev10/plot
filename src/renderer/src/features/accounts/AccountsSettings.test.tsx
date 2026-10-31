import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { anAccount, anAccountList } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { AccountsSettings } from './AccountsSettings';

const personal = anAccount('mona', { method: 'browser' });
const work = anAccount('mona-corp', { host: 'github.example.com', method: 'token' });

describe('AccountsSettings', () => {
  it('lists connected accounts with how each one signed in', async () => {
    renderWithApi(<AccountsSettings />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([personal, work])),
    });

    const list = await screen.findByRole('list', { name: 'Connected accounts' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('Signed in with the browser');
    expect(first).toHaveTextContent('Current');
    expect(second).toHaveTextContent('github.example.com');
    expect(second).toHaveTextContent('Personal access token');
  });

  it('switches the current account', async () => {
    const switchAccount = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<AccountsSettings />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([personal, work])),
      switchAccount,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Use mona-corp on github.example.com' }),
    );
    expect(switchAccount).toHaveBeenCalledWith(work.id);
  });

  it('asks before forgetting an account', async () => {
    const removeAccount = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<AccountsSettings />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([personal, work])),
      removeAccount,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove mona-corp on github.example.com' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(removeAccount).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove mona-corp on github.example.com' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeAccount).toHaveBeenCalledWith(work.id);
  });

  it('offers to connect an account when there is none, and to add more later', async () => {
    const { unmount } = renderWithApi(<AccountsSettings />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([])),
    });
    expect(
      await screen.findByRole('heading', { name: 'Connect a GitHub account' }),
    ).toBeInTheDocument();
    unmount();

    renderWithApi(<AccountsSettings />, {
      listAccounts: vi.fn().mockResolvedValue(anAccountList([personal])),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add an account' }));
    expect(screen.getByRole('heading', { name: 'Add an account' })).toBeInTheDocument();
  });
});
