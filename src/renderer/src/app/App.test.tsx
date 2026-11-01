import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anAccountList, aPullRequestDetail, aPullRequestSummary } from '../../test/builders';
import { renderWithApi } from '../../test/render';
import { initializePreferences } from '../lib/preferences';
import { App } from './App';

vi.mock('../features/diff/DiffViewer', () => import('../../test/fake-diff-viewer'));

beforeEach(() => {
  window.innerWidth = 1440;
});

const diff = {
  mergeBase: 'c'.repeat(40),
  head: 'd'.repeat(40),
  files: [
    {
      path: 'src/login.ts',
      status: 'modified' as const,
      kind: 'file' as const,
      oldBlob: 'a'.repeat(40),
      newBlob: 'b'.repeat(40),
      additions: 4,
      deletions: 1,
    },
  ],
};

function api() {
  return {
    listAccounts: vi.fn().mockResolvedValue(anAccountList()),
    listInbox: vi.fn().mockResolvedValue({
      reviewRequested: [aPullRequestSummary(42, { title: 'Fix login redirect' })],
      authored: [],
    }),
    getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail({ title: 'Fix login redirect' })),
    getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    readBlob: vi.fn().mockResolvedValue({ kind: 'text', text: 'export {}' }),
  };
}

describe('App', () => {
  it('opens a pull request from the inbox and shows its changed files', async () => {
    const fake = api();
    renderWithApi(<App />, fake);

    expect(
      screen.getByText('Select a pull request or a local repository to see what changed.'),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));

    expect(
      await screen.findByRole('heading', { name: 'Fix login redirect', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: /login\.ts/ })).toBeInTheDocument();
    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-path', 'src/login.ts');
    expect(fake.getPullRequestDiff).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('returns to the inbox and keeps the last pull request highlighted', async () => {
    renderWithApi(<App />, api());

    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    const files = await screen.findByRole('complementary', { name: 'Changed files' });
    await userEvent.click(within(files).getByRole('button', { name: 'Pull requests' }));

    expect(await screen.findByRole('button', { name: /Fix login redirect/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      screen.getByText('Select a pull request or a local repository to see what changed.'),
    ).toBeInTheDocument();
  });

  it('jumps to the line a review item points at', async () => {
    const fake = {
      ...api(),
      getReviewStatus: vi.fn().mockResolvedValue({
        state: 'done',
        head: 'd'.repeat(40),
        createdAt: new Date().toISOString(),
        review: {
          summary: 'Fixes the redirect.',
          changes: [
            {
              title: 'Open redirect',
              before: 'Redirects went anywhere.',
              after: 'The target is checked first.',
              location: { path: 'src/login.ts', line: 7, verified: true },
            },
          ],
          flows: [],
          architecture: { nodes: [], edges: [] },
          impacts: [],
          readingOrder: [],
        },
      }),
    };
    renderWithApi(<App />, fake);

    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'src/login.ts:7' }));

    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-reveal-line', '7');
  });

  it('maximizes the AI panel over the diff and restores it to show the code', async () => {
    const fake = {
      ...api(),
      getReviewStatus: vi.fn().mockResolvedValue({
        state: 'done',
        head: 'd'.repeat(40),
        createdAt: new Date().toISOString(),
        review: {
          summary: 'Fixes the redirect.',
          changes: [
            {
              title: 'Open redirect',
              before: 'Redirects went anywhere.',
              after: 'The target is checked first.',
              location: { path: 'src/login.ts', line: 7, verified: true },
            },
          ],
          flows: [],
          architecture: { nodes: [], edges: [] },
          impacts: [],
          readingOrder: [],
        },
      }),
    };
    renderWithApi(<App />, fake);
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await screen.findByTestId('diff-viewer');

    await userEvent.click(await screen.findByRole('button', { name: "Maximize (⇧⌘')" }));
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Changed files' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'AI overview' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'src/login.ts:7' }));
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-reveal-line', '7');

    fireEvent.keyDown(document.body, { key: "'", code: 'Quote', shiftKey: true, metaKey: true });
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "'", code: 'Quote', shiftKey: true, metaKey: true });
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('hides and shows the sidebar from the tool window bar', async () => {
    renderWithApi(<App />, api());
    const toggle = screen.getByRole('button', { name: 'Pull requests', pressed: true });

    await userEvent.click(toggle);

    expect(screen.queryByRole('complementary', { name: 'Pull requests' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Show pull requests' }));
    expect(screen.getByRole('complementary', { name: 'Pull requests' })).toBeInTheDocument();
  });

  it('remembers which panels were hidden', async () => {
    const { unmount } = renderWithApi(<App />, api());
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await userEvent.click(screen.getByRole('button', { name: 'AI overview', pressed: true }));
    unmount();

    renderWithApi(<App />, api());
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));

    expect(screen.getByRole('button', { name: 'AI overview', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI overview' })).not.toBeInTheDocument();
  });

  it('remembers panel widths set by dragging their edge', () => {
    const { unmount, container } = renderWithApi(<App />, api());
    const handle = screen.getByRole('separator', { name: 'Resize the sidebar' });

    fireEvent.pointerDown(handle, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 360, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--sidebar-width')).toBe(
      '360px',
    );
    unmount();

    const again = renderWithApi(<App />, api());
    expect(
      (again.container.firstChild as HTMLElement).style.getPropertyValue('--sidebar-width'),
    ).toBe('360px');
  });

  it('toggles panels from the keyboard', async () => {
    renderWithApi(<App />, api());
    const sidebar = () => screen.queryByRole('complementary', { name: 'Pull requests' });
    const review = () => screen.queryByRole('complementary', { name: 'AI overview' });

    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', metaKey: true });
    expect(review()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', metaKey: true });
    expect(review()).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'F12', metaKey: true, shiftKey: true });
    expect(sidebar()).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'F12', metaKey: true, shiftKey: true });
    expect(sidebar()).toBeInTheDocument();
    expect(review()).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', metaKey: true });
    expect(sidebar()).not.toBeInTheDocument();
  });

  it('opens settings from the app menu and applies a changed shortcut right away', async () => {
    const { menu } = renderWithApi(<App />, api());

    act(() => menu.send('open-settings'));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keymap' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove ⌘1 from Show or hide pull requests' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add a shortcut for Show or hide pull requests' }),
    );
    fireEvent.keyDown(
      within(dialog).getByRole('button', {
        name: 'Press the new shortcut for Show or hide pull requests',
      }),
      { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true },
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true });
    expect(screen.queryByRole('complementary', { name: 'Pull requests' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pull requests' })).toHaveAttribute(
      'title',
      'Pull requests (⌃⌥B)',
    );
  });

  it('keeps shortcuts quiet while settings are open', async () => {
    renderWithApi(<App />, api());
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', metaKey: true });

    expect(screen.getByRole('button', { name: 'Pull requests', hidden: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('goes back to the list and focuses the URL field to open another pull request', async () => {
    renderWithApi(<App />, api());
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await screen.findByRole('treeitem', { name: /login\.ts/ });

    fireEvent.keyDown(document.body, { key: 'o', code: 'KeyO', metaKey: true });

    expect(
      await screen.findByRole('searchbox', { name: 'Find or open a pull request' }),
    ).toHaveFocus();
  });

  it('shows the changes in a local repository, including uncommitted work', async () => {
    const repository = { id: '0123456789abcdef', name: 'api', path: '/work/api' };
    const file = {
      path: 'src/server.ts',
      status: 'modified' as const,
      kind: 'file' as const,
      oldBlob: 'e'.repeat(40),
      newBlob: null,
      additions: 1,
      deletions: 1,
    };
    const getLocalDiff = vi.fn().mockResolvedValue({
      branch: 'feature',
      base: { name: 'origin/main', commit: 'f'.repeat(40) },
      files: [file],
    });
    const getLocalSignature = vi.fn().mockResolvedValue('first');
    const { queryClient } = renderWithApi(<App />, {
      ...api(),
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      getLocalDiff,
      getLocalSignature,
      readLocalBlob: vi.fn().mockResolvedValue({ kind: 'text', text: 'listen(80)' }),
      readLocalFile: vi.fn().mockResolvedValue({ kind: 'text', text: 'listen(8080)' }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Local changes' }));
    await userEvent.click(await screen.findByRole('button', { name: /^api/ }));

    expect(await screen.findByRole('heading', { name: 'api', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Compared with origin\/main at fffffff/)).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: /server\.ts/ })).toBeInTheDocument();
    expect(await screen.findByTestId('original')).toHaveTextContent('listen(80)');
    expect(screen.getByTestId('modified')).toHaveTextContent('listen(8080)');
    expect(screen.queryByRole('complementary', { name: 'AI overview' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'AI overview', pressed: false }));
    expect(screen.getByText(/AI overviews work on pull requests for now/)).toBeInTheDocument();

    getLocalSignature.mockResolvedValue('second');
    await act(() => queryClient.refetchQueries({ queryKey: ['local-signature'] }));
    await vi.waitFor(() => expect(getLocalDiff).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('radio', { name: 'Uncommitted only' }));
    expect(getLocalDiff).toHaveBeenLastCalledWith({
      repositoryId: repository.id,
      compare: 'uncommitted',
    });

    const files = screen.getByRole('complementary', { name: 'Changed files' });
    await userEvent.click(within(files).getByRole('button', { name: 'Local changes' }));
    expect(await screen.findByRole('button', { name: /^api/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('keeps pull requests and local changes in separate tool windows', async () => {
    renderWithApi(<App />, {
      ...api(),
      listLocalRepositories: vi
        .fn()
        .mockResolvedValue([{ id: '0123456789abcdef', name: 'api', path: '/work/api' }]),
    });
    const pullRequests = () => screen.queryByRole('complementary', { name: 'Pull requests' });
    const localChanges = () => screen.queryByRole('complementary', { name: 'Local changes' });
    expect(pullRequests()).toBeInTheDocument();
    expect(localChanges()).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '0', code: 'Digit0', metaKey: true });
    expect(localChanges()).toBeInTheDocument();
    expect(pullRequests()).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^api/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local changes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.keyDown(document.body, { key: '0', code: 'Digit0', metaKey: true });
    expect(localChanges()).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', metaKey: true });
    expect(pullRequests()).toBeInTheDocument();
  });

  it('shows a folder opened from the File menu in the local changes window', async () => {
    const repository = { id: '0123456789abcdef', name: 'api', path: '/work/api' };
    const { menu } = renderWithApi(<App />, {
      ...api(),
      openLocalRepository: vi.fn().mockResolvedValue(repository),
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      getLocalDiff: vi.fn().mockResolvedValue({ branch: 'main', base: null, files: [] }),
      getLocalSignature: vi.fn().mockResolvedValue('same'),
    });

    act(() => menu.send('open-local-repository'));

    const files = await screen.findByRole('complementary', { name: 'Changed files' });
    expect(within(files).getByRole('button', { name: 'Local changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local changes', pressed: true })).toBeVisible();
  });

  it('remembers which tool window was showing', async () => {
    const { unmount } = renderWithApi(<App />, api());
    await userEvent.click(screen.getByRole('button', { name: 'Local changes' }));
    unmount();

    renderWithApi(<App />, api());

    expect(screen.getByRole('complementary', { name: 'Local changes' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pull requests' })).not.toBeInTheDocument();
  });

  it('browses the pull requests of a saved repository and comes back one step at a time', async () => {
    const repository = { host: 'github.com', owner: 'acme', repo: 'api' };
    initializePreferences({ 'pullRequests.repositories': [repository] }, () => {});
    const fake = {
      ...api(),
      countOpenPullRequests: vi.fn().mockResolvedValue(1),
      listRepositoryPullRequests: vi.fn().mockResolvedValue({
        pullRequests: [
          aPullRequestSummary(7, {
            title: 'Retry webhooks',
            ref: { ...repository, number: 7 },
          }),
        ],
        total: 1,
      }),
    };
    renderWithApi(<App />, fake);

    await userEvent.click(await screen.findByRole('button', { name: /^acme\/api/ }));
    const browse = await screen.findByRole('complementary', { name: 'acme/api' });
    await userEvent.click(await within(browse).findByRole('button', { name: /Retry webhooks/ }));
    expect(fake.getPullRequestDiff).toHaveBeenCalledWith({ ...repository, number: 7 });

    const files = await screen.findByRole('complementary', { name: 'Changed files' });
    await userEvent.click(within(files).getByRole('button', { name: 'acme/api' }));
    expect(await screen.findByRole('complementary', { name: 'acme/api' })).toBeVisible();

    fireEvent.keyDown(document.body, { key: '[', code: 'BracketLeft', metaKey: true });
    expect(screen.getByRole('complementary', { name: 'Pull requests' })).toBeVisible();
  });

  it('opens the pull request of a local folder in the pull requests window', async () => {
    const repository = { id: '0123456789abcdef', name: 'api', path: '/work/api' };
    const ref = { host: 'github.com', owner: 'acme', repo: 'api', number: 7 };
    const fake = {
      ...api(),
      listLocalRepositories: vi.fn().mockResolvedValue([repository]),
      getLocalStatus: vi.fn().mockResolvedValue({ branch: 'retry', changedFiles: 1 }),
      findLocalPullRequest: vi
        .fn()
        .mockResolvedValue(aPullRequestSummary(7, { ref, title: 'Retry webhooks' })),
      getLocalDiff: vi.fn().mockResolvedValue({ branch: 'retry', base: null, files: [] }),
      getLocalSignature: vi.fn().mockResolvedValue('same'),
    };
    renderWithApi(<App />, fake);

    await userEvent.click(screen.getByRole('button', { name: 'Local changes' }));
    await userEvent.click(await screen.findByRole('button', { name: /^api/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pull request #7' }));

    expect(fake.getPullRequestDiff).toHaveBeenCalledWith(ref);
    expect(screen.getByRole('button', { name: 'Pull requests', pressed: true })).toBeVisible();
  });

  it('opens a pull request pasted as a URL', async () => {
    const fake = api();
    renderWithApi(<App />, fake);

    await userEvent.type(
      await screen.findByRole('searchbox', { name: 'Find or open a pull request' }),
      'https://github.com/acme/api/pull/9{Enter}',
    );

    expect(await screen.findByRole('heading', { name: 'Fix login redirect' })).toBeInTheDocument();
    expect(fake.getPullRequest).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'acme',
      repo: 'api',
      number: 9,
    });
  });
});
