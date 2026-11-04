import type { ChangedFile } from '@shared/diff';
import type { LocalTarget } from '@shared/local';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { useFileContent } from './queries';

const file: ChangedFile = {
  path: 'src/server.ts',
  status: 'modified',
  kind: 'file',
  oldBlob: 'a'.repeat(40),
  newBlob: 'b'.repeat(40),
  additions: 1,
  deletions: 1,
};
function Content({
  target,
  changedFile = file,
}: {
  target: LocalTarget;
  changedFile?: ChangedFile;
}) {
  const content = useFileContent({ kind: 'local', ...target }, changedFile, 'modified');
  return <p>{content.data?.kind === 'text' ? content.data.text : 'Loading'}</p>;
}

describe('local file content', () => {
  it.each([
    { compare: 'branch', baseRef: 'main', headRef: 'feature', includeUncommitted: false },
    { compare: 'branch', baseRef: 'main', includeUncommitted: true },
    { compare: 'commits', commits: ['c'.repeat(40)] },
  ] as const)(
    'reads snapshot blobs rather than the current disk for $compare',
    async (selection) => {
      const readLocalBlob = vi.fn().mockResolvedValue({ kind: 'text', text: 'Selected snapshot' });
      const readLocalFile = vi
        .fn()
        .mockResolvedValue({ kind: 'text', text: 'Unrelated disk content' });
      renderWithApi(
        <Content
          target={{
            repositoryId: '0123456789abcdef',
            ...selection,
            commits: 'commits' in selection ? [...(selection.commits ?? [])] : undefined,
          }}
        />,
        { readLocalBlob, readLocalFile },
      );
      expect(await screen.findByText('Selected snapshot')).toBeInTheDocument();
      expect(readLocalBlob).toHaveBeenCalledWith('0123456789abcdef', file.newBlob);
      expect(readLocalFile).not.toHaveBeenCalled();
    },
  );

  it('still reads legacy working-tree diffs from disk', async () => {
    const readLocalFile = vi.fn().mockResolvedValue({ kind: 'text', text: 'Working changes' });
    renderWithApi(
      <Content
        target={{ repositoryId: '0123456789abcdef', compare: 'uncommitted' }}
        changedFile={{ ...file, newBlob: null }}
      />,
      { readLocalFile },
    );
    expect(await screen.findByText('Working changes')).toBeInTheDocument();
    expect(readLocalFile).toHaveBeenCalledWith('0123456789abcdef', file.path);
  });
});
