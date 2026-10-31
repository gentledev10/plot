import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { LocalRepositoryList } from './LocalRepositoryList';

const repository = { id: '0123456789abcdef', name: 'api', path: '/work/api' };

describe('LocalRepositoryList', () => {
  it('explains what local repositories are for before any is opened', async () => {
    renderWithApi(<LocalRepositoryList onOpen={vi.fn()} />);
    expect(await screen.findByText(/including work you have not committed/)).toBeInTheDocument();
  });

  it('opens a repository the user picks and remembers it', async () => {
    const onOpen = vi.fn();
    const openLocalRepository = vi.fn().mockResolvedValue(repository);
    renderWithApi(<LocalRepositoryList onOpen={onOpen} />, { openLocalRepository });

    await userEvent.click(screen.getByRole('button', { name: 'Open a local repository' }));

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith(repository));
  });

  it('does nothing when the folder picker is cancelled', async () => {
    const onOpen = vi.fn();
    renderWithApi(<LocalRepositoryList onOpen={onOpen} />, {
      openLocalRepository: vi.fn().mockResolvedValue(null),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open a local repository' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lists recent repositories, opens them, and removes them', async () => {
    const onOpen = vi.fn();
    const removeLocalRepository = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<LocalRepositoryList selectedId={repository.id} onOpen={onOpen} />, {
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      removeLocalRepository,
    });

    const item = await screen.findByRole('button', { name: /^api/ });
    expect(item).toHaveAttribute('aria-current', 'true');
    await userEvent.click(item);
    expect(onOpen).toHaveBeenCalledWith(repository);

    await userEvent.click(screen.getByRole('button', { name: 'Remove api from the list' }));
    expect(removeLocalRepository).toHaveBeenCalledWith(repository.id);
  });

  it('shows why a folder could not be opened', async () => {
    const { PlotError } = await import('../../lib/api');
    renderWithApi(<LocalRepositoryList onOpen={vi.fn()} />, {
      openLocalRepository: vi
        .fn()
        .mockRejectedValue(
          new PlotError('not-a-repository', 'That folder is not inside a git repository.'),
        ),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open a local repository' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not inside a git repository');
  });
});
