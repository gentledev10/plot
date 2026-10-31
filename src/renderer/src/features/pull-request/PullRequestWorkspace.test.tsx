import type { BlobContent, ChangedFile, PullRequestDiff } from '@shared/diff';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aPullRequestDetail } from '../../../test/builders';
import { resetFakeDiffViewer, setFakeChangeCount } from '../../../test/fake-diff-viewer';
import { renderWithApi } from '../../../test/render';
import { PlotError } from '../../lib/api';
import { readPreference, writePreference } from '../../lib/preferences';
import { PullRequestWorkspace } from './PullRequestWorkspace';

vi.mock('../diff/DiffViewer', () => import('../../../test/fake-diff-viewer'));

const target = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

function changed(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  const id = path.replace(/\W/g, '').padEnd(40, '0').slice(0, 40).toLowerCase();
  return {
    path,
    status: 'modified',
    kind: 'file',
    oldBlob: `a${id.slice(1)}`,
    newBlob: `b${id.slice(1)}`,
    additions: 1,
    deletions: 1,
    ...overrides,
  };
}

function diffOf(...files: ChangedFile[]): PullRequestDiff {
  return { mergeBase: 'c'.repeat(40), head: 'd'.repeat(40), files };
}

function Harness() {
  const [path, setPath] = useState<string>();
  return <PullRequestWorkspace target={target} selectedPath={path} onSelectPath={setPath} />;
}

function setup(diff: PullRequestDiff, blobs: Record<string, BlobContent> = {}) {
  const readBlob = vi.fn(async (_ref: unknown, blob: string) => {
    return blobs[blob] ?? { kind: 'text' as const, text: `content of ${blob.slice(0, 8)}` };
  });
  return renderWithApi(<Harness />, {
    getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail()),
    getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    readBlob,
  });
}

const counter = () => screen.getByText(/of \d+|differences?$/);
const shownPath = () => screen.getByTestId('diff-viewer').getAttribute('data-path');
const press = (key: string, modifiers: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document.body, { key, ...modifiers });

beforeEach(() => {
  resetFakeDiffViewer();
});

describe('PullRequestWorkspace', () => {
  it('opens the first file in tree order at its first difference', async () => {
    setFakeChangeCount('src/a.ts', 2);
    setup(diffOf(changed('README.md'), changed('src/a.ts')));

    await screen.findByTestId('diff-viewer');
    expect(shownPath()).toBe('src/a.ts');
    await waitFor(() => expect(counter()).toHaveTextContent('1 of 2'));
  });

  it('walks through differences and files with F7, like IntelliJ', async () => {
    setFakeChangeCount('a.ts', 2);
    setFakeChangeCount('b.ts', 3);
    setup(diffOf(changed('a.ts'), changed('b.ts')));
    await screen.findByTestId('diff-viewer');

    press('F7');
    expect(counter()).toHaveTextContent('2 of 2');

    press('F7');
    expect(screen.getByRole('status')).toHaveTextContent('Press F7 again to open b.ts');
    expect(shownPath()).toBe('a.ts');

    press('F7');
    await waitFor(() => expect(shownPath()).toBe('b.ts'));
    expect(counter()).toHaveTextContent('1 of 3');
    expect(screen.queryByText(/Press F7 again/)).not.toBeInTheDocument();
  });

  it('follows the keymap the user set up', async () => {
    writePreference('keymap', { 'diff.nextDifference': ['Alt+Meta+ArrowDown'] });
    setFakeChangeCount('a.ts', 2);
    setFakeChangeCount('b.ts', 1);
    setup(diffOf(changed('a.ts'), changed('b.ts')));
    await screen.findByTestId('diff-viewer');

    press('F7');
    expect(counter()).toHaveTextContent('1 of 2');

    press('ArrowDown', { altKey: true, metaKey: true });
    press('ArrowDown', { altKey: true, metaKey: true });
    expect(counter()).toHaveTextContent('2 of 2');
    expect(screen.getByRole('status')).toHaveTextContent('Press ⌥⌘↓ again to open b.ts');
    expect(screen.getByRole('button', { name: 'Next difference (⌥⌘↓)' })).toBeInTheDocument();
  });

  it('switches diff options from the keyboard once they have a shortcut', async () => {
    writePreference('keymap', { 'diff.toggleSideBySide': ['Alt+Meta+U'] });
    setup(diffOf(changed('a.ts')));
    await screen.findByTestId('diff-viewer');
    expect(screen.getByRole('button', { name: 'Switch to unified view' })).toBeInTheDocument();

    press('u', { code: 'KeyU', altKey: true, metaKey: true });

    expect(screen.getByRole('button', { name: 'Switch to side-by-side view' })).toBeInTheDocument();
  });

  it('goes back to the last difference of the previous file with Shift+F7', async () => {
    setFakeChangeCount('a.ts', 2);
    setFakeChangeCount('b.ts', 1);
    setup(diffOf(changed('a.ts'), changed('b.ts')));
    await screen.findByTestId('diff-viewer');
    press('F7');
    press('F7');
    press('F7');
    await waitFor(() => expect(shownPath()).toBe('b.ts'));

    press('F7', { shiftKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('Press ⇧F7 again to open a.ts');
    press('F7', { shiftKey: true });
    await waitFor(() => expect(shownPath()).toBe('a.ts'));
    expect(counter()).toHaveTextContent('2 of 2');
  });

  it('says so at the very last difference instead of wrapping around', async () => {
    setFakeChangeCount('a.ts', 1);
    setup(diffOf(changed('a.ts')));
    await screen.findByTestId('diff-viewer');

    press('F7');
    expect(screen.getByRole('status')).toHaveTextContent('This is the last difference.');
    expect(shownPath()).toBe('a.ts');
  });

  it('switches files directly with Ctrl+Shift+Arrow, IntelliJ’s Compare Next File', async () => {
    setup(diffOf(changed('a.ts'), changed('b.ts')));
    await screen.findByTestId('diff-viewer');

    press('ArrowRight', { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(shownPath()).toBe('b.ts'));
    press('ArrowLeft', { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(shownPath()).toBe('a.ts'));
  });

  it('navigates with the toolbar buttons too', async () => {
    setFakeChangeCount('a.ts', 2);
    setup(diffOf(changed('a.ts')));
    await screen.findByTestId('diff-viewer');

    await userEvent.click(screen.getByRole('button', { name: 'Next difference (F7)' }));
    expect(counter()).toHaveTextContent('2 of 2');
    await userEvent.click(screen.getByRole('button', { name: 'Previous difference (⇧F7)' }));
    expect(counter()).toHaveTextContent('1 of 2');
  });

  it('passes both versions of the file to the diff viewer', async () => {
    const file = changed('a.ts');
    setup(diffOf(file), {
      [file.oldBlob ?? '']: { kind: 'text', text: 'val x = 1' },
      [file.newBlob ?? '']: { kind: 'text', text: 'val x = 2' },
    });

    expect(await screen.findByTestId('original')).toHaveTextContent('val x = 1');
    expect(screen.getByTestId('modified')).toHaveTextContent('val x = 2');
  });

  it('shows added files against an empty original without reading a blob', async () => {
    const added = changed('new.ts', { status: 'added', oldBlob: null });
    const { api } = setup(diffOf(added));

    expect(await screen.findByTestId('original')).toHaveTextContent('');
    expect(api.readBlob).toHaveBeenCalledTimes(1);
  });

  it('explains binary and oversized files instead of drawing a diff', async () => {
    const image = changed('logo.png', { additions: null, deletions: null });
    const big = changed('big.json');
    setup(diffOf(big, image), {
      [image.oldBlob ?? '']: { kind: 'binary', size: 2048 },
      [image.newBlob ?? '']: { kind: 'binary', size: 4096 },
      [big.oldBlob ?? '']: { kind: 'too-large', size: 5 * 1024 * 1024 },
      [big.newBlob ?? '']: { kind: 'too-large', size: 6 * 1024 * 1024 },
    });

    expect(await screen.findByText('File too large to show')).toBeInTheDocument();
    expect(screen.getByText(/5\.0 MB → 6\.0 MB/)).toBeInTheDocument();

    press('ArrowRight', { ctrlKey: true, shiftKey: true });
    expect(await screen.findByText('Binary file')).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB → 4\.0 KB/)).toBeInTheDocument();
    expect(screen.queryByTestId('diff-viewer')).not.toBeInTheDocument();
  });

  it('describes submodule updates without reading their commits as files', async () => {
    const submodule = changed('vendor/lib', {
      kind: 'submodule',
      oldBlob: '1234567'.padEnd(40, '0'),
      newBlob: '89abcde'.padEnd(40, '0'),
    });
    const { api } = setup(diffOf(submodule));

    expect(await screen.findByText('Submodule changed')).toBeInTheDocument();
    expect(screen.getByText('1234567')).toBeInTheDocument();
    expect(screen.getByText('89abcde')).toBeInTheDocument();
    expect(api.readBlob).not.toHaveBeenCalled();
  });

  it('remembers the diff settings', async () => {
    setup(diffOf(changed('a.ts')));
    const collapse = await screen.findByRole('button', { name: 'Collapse unchanged fragments' });
    expect(collapse).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(collapse);
    expect(collapse).toHaveAttribute('aria-pressed', 'false');
    expect(readPreference('diff.settings', {})).toMatchObject({
      collapseUnchanged: false,
    });
  });

  it('shows why the changes could not be loaded, and retries', async () => {
    const getPullRequestDiff = vi
      .fn()
      .mockRejectedValueOnce(new PlotError('git-failed', 'git fetch failed: timed out'))
      .mockResolvedValue(diffOf(changed('a.ts')));
    renderWithApi(<Harness />, {
      getPullRequest: vi.fn().mockResolvedValue(aPullRequestDetail()),
      getPullRequestDiff,
      readBlob: vi.fn().mockResolvedValue({ kind: 'text', text: '' }),
    });

    expect(await screen.findByText('git fetch failed: timed out')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('diff-viewer')).toBeInTheDocument();
  });

  it('handles pull requests without file changes', async () => {
    setup(diffOf());
    expect(
      await screen.findByText('This pull request does not change any files.'),
    ).toBeInTheDocument();
  });
});
