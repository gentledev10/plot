import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandId } from './commands';
import { KeymapProvider, useCommand, useSuspendShortcuts } from './KeymapProvider';

function Handler({ id, run, enabled = true }: { id: CommandId; run(): void; enabled?: boolean }) {
  useCommand(id, run, enabled);
  return null;
}

function Suspender() {
  useSuspendShortcuts();
  return null;
}

const pressF7 = (target: Element = document.body) => fireEvent.keyDown(target, { key: 'F7' });

describe('KeymapProvider', () => {
  it('runs the command bound to a key and keeps the key from the page', () => {
    const run = vi.fn();
    const later = vi.fn();
    render(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={run} />
      </KeymapProvider>,
    );
    document.body.addEventListener('keydown', later);

    pressF7();

    expect(run).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', later);
  });

  it('lets keys through when no handler is mounted for their command', () => {
    const later = vi.fn();
    render(<KeymapProvider platform="darwin">{null}</KeymapProvider>);
    document.body.addEventListener('keydown', later);

    pressF7();

    expect(later).toHaveBeenCalledOnce();
    document.body.removeEventListener('keydown', later);
  });

  it('gives the key to the handler mounted last', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={outer} />
        <Handler id="diff.nextDifference" run={inner} />
      </KeymapProvider>,
    );

    pressF7();
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();

    rerender(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={outer} />
      </KeymapProvider>,
    );
    pressF7();
    expect(outer).toHaveBeenCalledOnce();
  });

  it('skips disabled handlers', () => {
    const run = vi.fn();
    render(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={run} enabled={false} />
      </KeymapProvider>,
    );
    pressF7();
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves keys alone while the user types or a dialog is open', () => {
    const run = vi.fn();
    const { rerender } = render(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={run} />
        <input aria-label="url" />
      </KeymapProvider>,
    );
    pressF7(screen.getByLabelText('url'));
    expect(run).not.toHaveBeenCalled();

    rerender(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={run} />
        <Suspender />
      </KeymapProvider>,
    );
    pressF7();
    expect(run).not.toHaveBeenCalled();
  });

  it('reads customized shortcuts from the preferences', () => {
    localStorage.setItem('viewer.keymap', JSON.stringify({ 'diff.nextDifference': ['Meta+J'] }));
    const run = vi.fn();
    render(
      <KeymapProvider platform="darwin">
        <Handler id="diff.nextDifference" run={run} />
      </KeymapProvider>,
    );

    pressF7();
    expect(run).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ', metaKey: true });
    expect(run).toHaveBeenCalledOnce();
  });
});
