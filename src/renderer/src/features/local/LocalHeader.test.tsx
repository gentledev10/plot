import type { LocalTarget } from '@shared/local';
import { createTranslator } from '@shared/translations';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { LocalHeader } from './LocalHeader';

function Header({
  initial = { repositoryId: '0123456789abcdef', compare: 'commits' } as LocalTarget,
}) {
  const [target, setTarget] = useState(initial);
  return (
    <>
      <LocalHeader target={target} onTargetChange={setTarget} />
      <output aria-label="Current comparison target">{JSON.stringify(target)}</output>
    </>
  );
}

describe('LocalHeader history', () => {
  it.each([
    'Base branch',
    'Compare branch',
    'Include uncommitted changes',
    'Commit history branch',
    'Selected commits',
    'Select commits',
    'Automatic base',
    'Current checkout',
    'Loading local history…',
    'Could not load local history',
    'No commits on this branch.',
    'Showing the latest 100 commits.',
    'Select commits to compare their changes.',
    'Compared with {name} at {commit}.',
  ])('translates %s through the canonical dictionary', (label) => {
    expect(createTranslator('ko')(label)).not.toBe(label);
  });
  it('offers only uncommitted work and selected commits without branch comparison controls', async () => {
    renderWithApi(
      <Header initial={{ repositoryId: '0123456789abcdef', compare: 'uncommitted' }} />,
      {
        getLocalDiff: vi.fn().mockResolvedValue({ branch: 'feature', base: null, files: [] }),
      },
    );
    expect(screen.getByRole('radio', { name: 'Uncommitted only' })).toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: 'Branch changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Base branch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Compare branch' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Include uncommitted changes' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Selected commits' }));
    expect(
      await screen.findByRole('combobox', { name: 'Commit history branch' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('drops selected commits that disappear from refreshed history', async () => {
    const commit = {
      sha: 'a'.repeat(40),
      subject: 'Removed commit',
      parents: [],
      author: 'A developer',
      date: '2026-11-01',
    };
    const getLocalHistory = vi
      .fn()
      .mockResolvedValue({ branches: [], commits: [commit], hasMore: false });
    const { queryClient } = renderWithApi(<Header />, {
      getLocalHistory,
      getLocalDiff: vi.fn().mockResolvedValue({ branch: null, base: null, files: [] }),
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: /Removed commit/ }));
    expect(screen.getByRole('status', { name: 'Current comparison target' })).toHaveTextContent(
      commit.sha,
    );
    getLocalHistory.mockResolvedValue({ branches: [], commits: [], hasMore: false });
    await act(() => queryClient.refetchQueries({ queryKey: ['local-history'] }));
    await vi.waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Current comparison target' }),
      ).not.toHaveTextContent(commit.sha),
    );
  });

  it('shows history loading, an error with retry, then an empty history', async () => {
    let reject!: (error: Error) => void;
    const getLocalHistory = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue({ branches: [], commits: [], hasMore: false });
    renderWithApi(<Header />, { getLocalHistory });
    expect(screen.getByText('Loading local history…')).toBeInTheDocument();
    await act(async () => reject(new Error('Repository unavailable')));
    expect(await screen.findByText('Could not load local history')).toBeInTheDocument();
    expect(screen.getByText('Repository unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No commits on this branch.')).toBeInTheDocument();
  });
});
