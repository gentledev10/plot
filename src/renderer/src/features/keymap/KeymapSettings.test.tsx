import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { readPreference } from '../../lib/preferences';
import { KeymapProvider } from './KeymapProvider';
import { KeymapSettings } from './KeymapSettings';

function setup() {
  return render(
    <KeymapProvider platform="darwin">
      <KeymapSettings />
    </KeymapProvider>,
  );
}

const row = (title: string) => {
  const item = screen.getByText(title).closest('li');
  if (!item) {
    throw new Error(`No row for ${title}`);
  }
  return within(item);
};

const stored = () => readPreference('keymap', {});

async function record(title: string, init: KeyboardEventInit) {
  await userEvent.click(screen.getByRole('button', { name: `Add a shortcut for ${title}` }));
  fireEvent.keyDown(
    screen.getByRole('button', { name: `Press the new shortcut for ${title}` }),
    init,
  );
}

describe('KeymapSettings', () => {
  it('lists every command with its default shortcuts', () => {
    setup();
    expect(row('Next difference').getByText('F7')).toBeInTheDocument();
    expect(row('Previous file').getByText('⌃⇧←')).toBeInTheDocument();
    expect(row('Review changes').getByText('None')).toBeInTheDocument();
  });

  it('records a new shortcut and saves it', async () => {
    setup();
    await record('Review changes', { key: 'r', code: 'KeyR', altKey: true, metaKey: true });

    expect(row('Review changes').getByText('⌥⌘R')).toBeInTheDocument();
    expect(stored()).toEqual({ 'review.generate': ['Alt+Meta+R'] });
  });

  it('ignores a modifier pressed on its own while recording', async () => {
    setup();
    await record('Review changes', { key: 'Meta', code: 'MetaLeft', metaKey: true });
    expect(
      screen.getByRole('button', { name: 'Press the new shortcut for Review changes' }),
    ).toHaveTextContent('Press keys…');
  });

  it('asks before taking a shortcut from another command', async () => {
    setup();
    await record('Review changes', { key: '2', code: 'Digit2', metaKey: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Used by Show or hide the AI overview.');
    await userEvent.click(screen.getByRole('button', { name: 'Reassign' }));

    expect(row('Review changes').getByText('⌘2')).toBeInTheDocument();
    expect(row('Show or hide the AI overview').getByText('None')).toBeInTheDocument();
  });

  it('refuses shortcuts that macOS or typing need', async () => {
    setup();
    await record('Review changes', { key: 'q', code: 'KeyQ', metaKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent('⌘Q quits the app');

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Press the new shortcut for Review changes' }),
      { key: 'j', code: 'KeyJ' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Add ⌘, ⌃, or ⌥');
    expect(stored()).toEqual({});
  });

  it('cancels recording with Escape', async () => {
    setup();
    await record('Next difference', { key: 'Escape', code: 'Escape' });
    expect(
      screen.getByRole('button', { name: 'Add a shortcut for Next difference' }),
    ).toBeInTheDocument();
  });

  it('removes a shortcut and resets the command', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove F7 from Next difference' }));
    expect(row('Next difference').getByText('None')).toBeInTheDocument();
    expect(stored()).toEqual({ 'diff.nextDifference': [] });

    await userEvent.click(screen.getByRole('button', { name: 'Reset Next difference' }));
    expect(row('Next difference').getByText('F7')).toBeInTheDocument();
    expect(stored()).toEqual({});
  });

  it('resets every command at once', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove F7 from Next difference' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));

    expect(row('Next difference').getByText('F7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  });
});
