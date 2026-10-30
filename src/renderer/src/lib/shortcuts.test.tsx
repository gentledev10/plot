import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isTypingTarget, matchesShortcut, useShortcuts } from './shortcuts';

const press = (key: string, modifiers: Partial<KeyboardEventInit> = {}) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

describe('matchesShortcut', () => {
  const run = () => {};

  it('requires the exact modifiers', () => {
    expect(matchesShortcut(press('F7'), { key: 'F7', run })).toBe(true);
    expect(matchesShortcut(press('F7', { shiftKey: true }), { key: 'F7', run })).toBe(false);
    expect(matchesShortcut(press('F7', { shiftKey: true }), { key: 'F7', shift: true, run })).toBe(
      true,
    );
    expect(
      matchesShortcut(press('ArrowRight', { ctrlKey: true, shiftKey: true }), {
        key: 'ArrowRight',
        ctrl: true,
        shift: true,
        run,
      }),
    ).toBe(true);
  });
});

describe('isTypingTarget', () => {
  it('treats the app inputs as typing targets', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
  });

  it('lets shortcuts through from the read-only code editor', () => {
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = document.createElement('textarea');
    editor.append(textarea);
    expect(isTypingTarget(textarea)).toBe(false);
  });

  it('ignores non-element targets and plain elements', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});

function Harness({ onNext }: { onNext(): void }) {
  useShortcuts([{ key: 'F7', run: onNext }]);
  return <input aria-label="url" />;
}

describe('useShortcuts', () => {
  it('runs the matching shortcut and stops the key from reaching other handlers', () => {
    const onNext = vi.fn();
    const later = vi.fn();
    render(<Harness onNext={onNext} />);
    document.body.addEventListener('keydown', later);

    fireEvent.keyDown(document.body, { key: 'F7' });

    expect(onNext).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', later);
  });

  it('leaves keys alone while the user types in an input', () => {
    const onNext = vi.fn();
    const { getByLabelText } = render(<Harness onNext={onNext} />);
    fireEvent.keyDown(getByLabelText('url'), { key: 'F7' });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const onNext = vi.fn();
    const { unmount } = render(<Harness onNext={onNext} />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'F7' });
    expect(onNext).not.toHaveBeenCalled();
  });
});
