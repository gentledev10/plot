import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { LocalChangesPanel } from './LocalChangesPanel';

const repository = { id: '0123456789abcdef', name: 'api', path: '/work/api' };

describe('LocalChangesPanel', () => {
  it('explains what local repositories are for and offers to open one', async () => {
    const onOpen = vi.fn();
    const openLocalRepository = vi.fn().mockResolvedValue(repository);
    renderWithApi(<LocalChangesPanel onOpen={onOpen} />, {
      listLocalRepositories: vi.fn().mockResolvedValue([]),
      openLocalRepository,
    });

    expect(await screen.findByText(/including work you have not committed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose a folder…' }));

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith(repository));
  });

  it('opens a repository the user picks and remembers it', async () => {
    const onOpen = vi.fn();
    const openLocalRepository = vi.fn().mockResolvedValue(repository);
    renderWithApi(<LocalChangesPanel onOpen={onOpen} />, { openLocalRepository });

    await userEvent.click(screen.getByRole('button', { name: 'Open a local repository' }));

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith(repository));
  });

  it('does nothing when the folder picker is cancelled', async () => {
    const onOpen = vi.fn();
    renderWithApi(<LocalChangesPanel onOpen={onOpen} />, {
      openLocalRepository: vi.fn().mockResolvedValue(null),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open a local repository' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lists recent repositories, opens them, and removes them', async () => {
    const onOpen = vi.fn();
    const removeLocalRepository = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<LocalChangesPanel selectedId={repository.id} onOpen={onOpen} />, {
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

  it('shows the branch of each folder and how many files changed on it', async () => {
    const getLocalStatus = vi.fn(async (id: string) =>
      id === repository.id
        ? { branch: 'feature/retry', changedFiles: 5 }
        : { branch: null, changedFiles: 0 },
    );
    renderWithApi(<LocalChangesPanel onOpen={vi.fn()} />, {
      listLocalRepositories: vi
        .fn()
        .mockResolvedValue([
          repository,
          { id: 'fedcba9876543210', name: 'web', path: '/work/web' },
        ]),
      getLocalStatus,
    });

    const api = await screen.findByRole('button', { name: /^api/ });
    expect(await within(api).findByText('5 changed')).toBeInTheDocument();
    expect(api).toHaveTextContent('feature/retry');
    expect(api).toHaveAttribute('title', '/work/api');
    const web = screen.getByRole('button', { name: /^web/ });
    expect(await within(web).findByText('No changes')).toBeInTheDocument();
    expect(web).toHaveTextContent('Detached HEAD');
  });

  it('says which folder could not be read', async () => {
    const { PlotError } = await import('../../lib/api');
    renderWithApi(<LocalChangesPanel onOpen={vi.fn()} />, {
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      getLocalStatus: vi
        .fn()
        .mockRejectedValue(new PlotError('git-failed', 'git rev-parse failed: no such directory')),
    });

    expect(await screen.findByText('Could not read this folder')).toHaveAttribute(
      'title',
      'git rev-parse failed: no such directory',
    );
  });

  it('refreshes the folders from the header', async () => {
    const getLocalStatus = vi.fn().mockResolvedValue({ branch: 'main', changedFiles: 1 });
    renderWithApi(<LocalChangesPanel onOpen={vi.fn()} />, {
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      getLocalStatus,
    });
    await screen.findByText('1 changed');

    getLocalStatus.mockResolvedValue({ branch: 'main', changedFiles: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('2 changed')).toBeInTheDocument();
  });

  it('shows why a folder could not be opened', async () => {
    const { PlotError } = await import('../../lib/api');
    renderWithApi(<LocalChangesPanel onOpen={vi.fn()} />, {
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
