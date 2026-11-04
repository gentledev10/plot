import type { LocalTarget } from '@shared/local';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { useTargetDiff } from '../diff/queries';
import { useLocalAutoRefresh } from './queries';

function Live({ initial }: { initial: LocalTarget }) {
  const [target, setTarget] = useState(initial);
  useLocalAutoRefresh(target);
  useTargetDiff({ kind: 'local', ...target });
  return (
    <button type="button" onClick={() => setTarget({ ...target, headRef: 'other' })}>
      Compare another branch
    </button>
  );
}

describe('local refresh', () => {
  it('does not poll a commit comparison before any commit is selected', async () => {
    const getLocalSignature = vi.fn().mockResolvedValue('signature');
    renderWithApi(<Live initial={{ repositoryId: '0123456789abcdef', compare: 'commits' }} />, {
      getLocalSignature,
    });
    await act(async () => {});
    expect(getLocalSignature).not.toHaveBeenCalled();
  });

  it('starts a new signature baseline when the comparison target changes', async () => {
    const getLocalSignature = vi
      .fn()
      .mockImplementation(async (target: LocalTarget) => target.headRef ?? 'current');
    const getLocalDiff = vi.fn().mockResolvedValue({ branch: 'feature', base: null, files: [] });
    const { queryClient } = renderWithApi(
      <Live initial={{ repositoryId: '0123456789abcdef', compare: 'branch' }} />,
      { getLocalSignature, getLocalDiff },
    );
    await vi.waitFor(() => expect(getLocalDiff).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Compare another branch' }));
    await vi.waitFor(() => expect(getLocalSignature).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(getLocalDiff).toHaveBeenCalledTimes(2);
    getLocalSignature.mockResolvedValue('changed');
    await act(() => queryClient.refetchQueries({ queryKey: ['local-signature'] }));
    await vi.waitFor(() => expect(getLocalDiff).toHaveBeenCalledTimes(3));
    expect(getLocalDiff).toHaveBeenLastCalledWith({
      repositoryId: '0123456789abcdef',
      compare: 'branch',
      headRef: 'other',
    });
  });
});
