import type { ChangedFile } from '@shared/diff';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { ViewerError } from '../../lib/api';
import { FilesPanel } from './FilesPanel';

const target = { owner: 'octocat', repo: 'hello-world', number: 42 };

function changed(path: string, additions: number | null, deletions: number | null): ChangedFile {
  return {
    path,
    status: 'modified',
    kind: 'file',
    oldBlob: 'a'.repeat(40),
    newBlob: 'b'.repeat(40),
    additions,
    deletions,
  };
}

const diff = {
  mergeBase: 'c'.repeat(40),
  head: 'd'.repeat(40),
  files: [
    changed('src/app.ts', 10, 2),
    changed('README.md', 1, 3),
    changed('logo.png', null, null),
  ],
};

describe('FilesPanel', () => {
  it('lists the changed files and totals', async () => {
    renderWithApi(<FilesPanel target={target} onSelectFile={vi.fn()} onBack={vi.fn()} />, {
      getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    });

    expect(await screen.findByRole('tree', { name: 'Changed files' })).toBeInTheDocument();
    expect(screen.getByText('octocat/hello-world#42')).toBeInTheDocument();
    expect(screen.getByText('3 files')).toBeInTheDocument();
    expect(screen.getByText('+11')).toBeInTheDocument();
    expect(screen.getByText('−5')).toBeInTheDocument();
  });

  it('highlights the first file until another one is picked', async () => {
    renderWithApi(<FilesPanel target={target} onSelectFile={vi.fn()} onBack={vi.fn()} />, {
      getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    });
    expect(await screen.findByRole('treeitem', { name: /app\.ts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the file that is clicked', async () => {
    const onSelectFile = vi.fn();
    renderWithApi(<FilesPanel target={target} onSelectFile={onSelectFile} onBack={vi.fn()} />, {
      getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    });
    await userEvent.click(await screen.findByRole('treeitem', { name: /README\.md/ }));
    expect(onSelectFile).toHaveBeenCalledWith('README.md');
  });

  it('goes back to the pull request list', async () => {
    const onBack = vi.fn();
    renderWithApi(<FilesPanel target={target} onSelectFile={vi.fn()} onBack={onBack} />, {
      getPullRequestDiff: vi.fn().mockResolvedValue(diff),
    });
    await userEvent.click(screen.getByRole('button', { name: /Pull requests/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows progress while fetching and errors with a retry', async () => {
    const getPullRequestDiff = vi
      .fn()
      .mockRejectedValueOnce(new ViewerError('git-not-installed', 'Git is not installed.'))
      .mockResolvedValue(diff);
    renderWithApi(<FilesPanel target={target} onSelectFile={vi.fn()} onBack={vi.fn()} />, {
      getPullRequestDiff,
    });

    expect(screen.getByText('Fetching changes…')).toBeInTheDocument();
    expect(await screen.findByText('Git is not installed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('tree')).toBeInTheDocument();
  });
});
