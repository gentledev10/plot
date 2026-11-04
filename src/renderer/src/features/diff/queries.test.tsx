import type { ChangedFile } from '@shared/diff';
import type { LocalTarget } from '@shared/local';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { AppProviders } from '../../app/providers';
import { type FileSide, useFileContent } from './queries';

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
  side = 'modified',
}: {
  target: LocalTarget;
  changedFile?: ChangedFile;
  side?: FileSide;
}) {
  const content = useFileContent({ kind: 'local', ...target }, changedFile, side);
  return <p>{content.data?.kind === 'text' ? content.data.text : 'Loading'}</p>;
}

describe('local file content', () => {
  it.each([
    { compare: 'uncommitted' },
    { compare: 'commits', headRef: 'feature', commits: ['d'.repeat(40)] },
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

  it('keeps original snapshot blobs cached across commit and history branch selections', async () => {
    const readLocalBlob = vi.fn().mockResolvedValue({ kind: 'text', text: 'Original snapshot' });
    const readLocalFile = vi.fn();
    const { rerender, api, queryClient } = renderWithApi(
      <Content
        target={{ repositoryId: '0123456789abcdef', compare: 'uncommitted' }}
        side="original"
      />,
      { readLocalBlob, readLocalFile },
    );
    expect(await screen.findByText('Original snapshot')).toBeInTheDocument();
    expect(readLocalBlob).toHaveBeenCalledWith('0123456789abcdef', file.oldBlob);
    rerender(
      <AppProviders api={api} queryClient={queryClient} platform="darwin">
        <Content
          target={{
            repositoryId: '0123456789abcdef',
            compare: 'commits',
            headRef: 'other',
            commits: ['c'.repeat(40)],
          }}
          side="original"
        />
      </AppProviders>,
    );
    expect(screen.getByText('Original snapshot')).toBeInTheDocument();
    expect(readLocalBlob).toHaveBeenCalledTimes(1);
    rerender(
      <AppProviders api={api} queryClient={queryClient} platform="darwin">
        <Content
          target={{
            repositoryId: '0123456789abcdef',
            compare: 'commits',
            commits: ['d'.repeat(40)],
          }}
          changedFile={{ ...file, oldBlob: 'e'.repeat(40) }}
          side="original"
        />
      </AppProviders>,
    );
    await vi.waitFor(() => expect(readLocalBlob).toHaveBeenCalledTimes(2));
    expect(readLocalBlob).toHaveBeenLastCalledWith('0123456789abcdef', 'e'.repeat(40));
    expect(readLocalFile).not.toHaveBeenCalled();
  });

  it('reads working-tree diffs from disk when no snapshot blob is supplied', async () => {
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
