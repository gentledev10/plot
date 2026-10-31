import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail, aPullRequestSummary, aUser } from '../../test/builders';
import { renderWithApi } from '../../test/render';
import { App } from './App';

vi.mock('../features/diff/DiffViewer', () => import('../../test/fake-diff-viewer'));

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
    getSession: vi.fn().mockResolvedValue({ status: 'signed-in', user: aUser() }),
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

    expect(screen.getByText('Select a pull request to start reviewing.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));

    expect(
      await screen.findByRole('heading', { name: 'Fix login redirect', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: /login\.ts/ })).toBeInTheDocument();
    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-path', 'src/login.ts');
    expect(fake.getPullRequestDiff).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('returns to the inbox and keeps the last pull request highlighted', async () => {
    renderWithApi(<App />, api());

    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Pull requests/ }));

    expect(await screen.findByRole('button', { name: /Fix login redirect/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('Select a pull request to start reviewing.')).toBeInTheDocument();
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
          readingOrder: [],
          flows: [],
          architecture: { nodes: [], edges: [] },
          risks: [
            {
              title: 'Open redirect',
              detail: 'The target is not validated.',
              severity: 'high',
              location: { path: 'src/login.ts', line: 7, verified: true },
            },
          ],
        },
      }),
    };
    renderWithApi(<App />, fake);

    await userEvent.click(await screen.findByRole('button', { name: /Fix login redirect/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'src/login.ts:7' }));

    expect(await screen.findByTestId('diff-viewer')).toHaveAttribute('data-reveal-line', '7');
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
    await userEvent.click(screen.getByRole('button', { name: 'AI review', pressed: true }));
    unmount();

    renderWithApi(<App />, api());

    expect(screen.getByRole('button', { name: 'AI review', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'AI review' })).not.toBeInTheDocument();
  });

  it('toggles panels from the keyboard', async () => {
    renderWithApi(<App />, api());
    const sidebar = () => screen.queryByRole('complementary', { name: 'Pull requests' });
    const review = () => screen.queryByRole('complementary', { name: 'AI review' });

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
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove ⌘1 from Show or hide the sidebar' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add a shortcut for Show or hide the sidebar' }),
    );
    fireEvent.keyDown(
      within(dialog).getByRole('button', {
        name: 'Press the new shortcut for Show or hide the sidebar',
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

    expect(await screen.findByRole('textbox', { name: 'Pull request URL' })).toHaveFocus();
  });

  it('opens a pull request pasted as a URL', async () => {
    const fake = { ...api(), getSession: vi.fn().mockResolvedValue({ status: 'signed-out' }) };
    renderWithApi(<App />, fake);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Pull request URL' }),
      'https://github.com/acme/api/pull/9{Enter}',
    );

    expect(await screen.findByRole('heading', { name: 'Fix login redirect' })).toBeInTheDocument();
    expect(fake.getPullRequest).toHaveBeenCalledWith({ owner: 'acme', repo: 'api', number: 9 });
  });
});
