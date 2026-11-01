import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { PlotError } from '../../lib/api';
import { initializePreferences, readPreference } from '../../lib/preferences';
import { RepositorySection } from './RepositorySection';
import { parseRepositoryList, REPOSITORY_LIST_PREFERENCE } from './repository-list';

const api = { host: 'github.com', owner: 'acme', repo: 'api' };
const web = { host: 'github.com', owner: 'acme', repo: 'web' };
const docs = { host: 'github.com', owner: 'acme', repo: 'docs' };
const infra = { host: 'github.example.com', owner: 'platform', repo: 'infra' };

function saved() {
  return readPreference(REPOSITORY_LIST_PREFERENCE, [], parseRepositoryList);
}

function show(props: { query?: string; onOpen?: () => void } = {}, fakes = {}) {
  return renderWithApi(
    <RepositorySection
      query={props.query ?? ''}
      accountId="github.com/octocat"
      defaultHost="github.com"
      onOpen={props.onOpen ?? vi.fn()}
    />,
    fakes,
  );
}

describe('RepositorySection', () => {
  it('invites people to add a repository', () => {
    show();
    expect(screen.getByText('Add a repository to browse all of its pull requests.')).toBeVisible();
  });

  it('adds a suggested repository and shows how many pull requests are open', async () => {
    initializePreferences({ [REPOSITORY_LIST_PREFERENCE]: [web] }, () => {});
    const findRepository = vi.fn().mockResolvedValue(docs);
    show(
      {},
      {
        listAccessibleRepositories: vi.fn().mockResolvedValue([api, web, docs]),
        findRepository,
        countOpenPullRequests: vi.fn(async (ref: typeof api) => (ref.repo === 'docs' ? 3 : 4)),
      },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add a repository' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Repository to add' }), 'acme/');
    expect(screen.getByRole('button', { name: /acme\/web\s*Added/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'acme/docs' }));

    expect(findRepository).toHaveBeenCalledWith(docs);
    const row = await screen.findByRole('button', { name: /^acme\/docs/ });
    expect(await within(row).findByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Repository to add' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a repository' })).toHaveFocus();
    expect(saved()).toEqual([web, docs]);
  });

  it('adds a repository typed by hand with the name GitHub uses', async () => {
    const findRepository = vi.fn().mockResolvedValue(infra);
    show({}, { findRepository });

    await userEvent.click(screen.getByRole('button', { name: 'Add a repository' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Repository to add' }),
      'https://github.example.com/Platform/Infra{Enter}',
    );

    expect(findRepository).toHaveBeenCalledWith({ ...infra, owner: 'Platform', repo: 'Infra' });
    expect(await screen.findByRole('button', { name: /^platform\/infra/ })).toHaveTextContent(
      'github.example.com',
    );
  });

  it('keeps the popover open and explains why a repository could not be added', async () => {
    show(
      {},
      {
        findRepository: vi
          .fn()
          .mockRejectedValue(
            new PlotError(
              'github-not-found',
              'GitHub could not find it, or your account does not have access.',
            ),
          ),
      },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add a repository' }));
    const input = screen.getByRole('textbox', { name: 'Repository to add' });
    await userEvent.type(input, 'acme/secret{Enter}');

    expect(await screen.findByText(/could not find it/)).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(saved()).toEqual([]);
  });

  it('asks for a repository when the text is not one', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Add a repository' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Repository to add' }), 'acme{Enter}');
    expect(screen.getByRole('textbox', { name: 'Repository to add' })).toHaveAccessibleDescription(
      'Type owner/repo, or paste a repository URL.',
    );
    expect(screen.getByRole('textbox', { name: 'Repository to add' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('opens and removes repositories', async () => {
    initializePreferences({ [REPOSITORY_LIST_PREFERENCE]: [api, web] }, () => {});
    const onOpen = vi.fn();
    show({ onOpen });

    await userEvent.click(screen.getByRole('button', { name: /^acme\/api/ }));
    expect(onOpen).toHaveBeenCalledWith(api);

    await userEvent.click(screen.getByRole('button', { name: 'Remove acme/web from the list' }));
    expect(screen.queryByRole('button', { name: /^acme\/web/ })).not.toBeInTheDocument();
    expect(saved()).toEqual([api]);
  });

  it('filters repositories with the pull request filter', () => {
    initializePreferences({ [REPOSITORY_LIST_PREFERENCE]: [api, web] }, () => {});
    show({ query: 'web' });

    expect(screen.getByRole('button', { name: /^acme\/web/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^acme\/api/ })).not.toBeInTheDocument();
  });

  it('marks a repository whose pull requests could not be counted', async () => {
    initializePreferences({ [REPOSITORY_LIST_PREFERENCE]: [infra] }, () => {});
    show(
      {},
      {
        countOpenPullRequests: vi
          .fn()
          .mockRejectedValue(new PlotError('github-no-account', 'No account for this server.')),
      },
    );

    expect(
      await screen.findByRole('img', {
        name: 'Could not count the pull requests: No account for this server.',
      }),
    ).toBeInTheDocument();
  });
});
