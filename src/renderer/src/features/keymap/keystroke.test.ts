import { describe, expect, it } from 'vitest';
import {
  formatStroke,
  isTypingTarget,
  type KeyEventLike,
  normalizeStroke,
  strokeFromEvent,
  strokeProblem,
} from './keystroke';

function press(key: string, code: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

describe('strokeFromEvent', () => {
  it('names function keys, arrows, and modifiers in a fixed order', () => {
    expect(strokeFromEvent(press('F7', 'F7'))).toBe('F7');
    expect(strokeFromEvent(press('F7', 'F7', { shiftKey: true }))).toBe('Shift+F7');
    expect(
      strokeFromEvent(press('ArrowRight', 'ArrowRight', { shiftKey: true, ctrlKey: true })),
    ).toBe('Ctrl+Shift+ArrowRight');
    expect(strokeFromEvent(press(' ', 'Space', { ctrlKey: true }))).toBe('Ctrl+Space');
  });

  it('reads letters, digits, and punctuation from the physical key', () => {
    expect(strokeFromEvent(press('ㅣ', 'KeyL', { metaKey: true }))).toBe('Meta+L');
    expect(strokeFromEvent(press('©', 'KeyG', { altKey: true }))).toBe('Alt+G');
    expect(strokeFromEvent(press('!', 'Digit1', { shiftKey: true, metaKey: true }))).toBe(
      'Shift+Meta+1',
    );
    expect(strokeFromEvent(press('[', 'BracketLeft', { metaKey: true }))).toBe('Meta+[');
  });

  it('falls back to the key when the event has no physical code', () => {
    expect(strokeFromEvent(press('l', '', { metaKey: true }))).toBe('Meta+L');
    expect(strokeFromEvent(press('1', '', { metaKey: true }))).toBe('Meta+1');
  });

  it('ignores presses of a modifier on its own and keys it does not know', () => {
    expect(strokeFromEvent(press('Meta', 'MetaLeft', { metaKey: true }))).toBeUndefined();
    expect(strokeFromEvent(press('Shift', 'ShiftLeft', { shiftKey: true }))).toBeUndefined();
    expect(strokeFromEvent(press('Process', ''))).toBeUndefined();
  });
});

describe('normalizeStroke', () => {
  it('puts modifiers in the canonical order', () => {
    expect(normalizeStroke('Meta+Shift+F12')).toBe('Shift+Meta+F12');
    expect(normalizeStroke('F7')).toBe('F7');
  });

  it('rejects unknown keys, unknown modifiers, and repeats', () => {
    expect(normalizeStroke('Meta+Hyper')).toBeUndefined();
    expect(normalizeStroke('Cmd+L')).toBeUndefined();
    expect(normalizeStroke('Meta+Meta+L')).toBeUndefined();
    expect(normalizeStroke('')).toBeUndefined();
  });
});

describe('formatStroke', () => {
  it('uses the macOS symbols in the order macOS menus show them', () => {
    expect(formatStroke('Ctrl+Shift+ArrowRight', 'darwin')).toBe('⌃⇧→');
    expect(formatStroke('Shift+Meta+F12', 'darwin')).toBe('⇧⌘F12');
    expect(formatStroke('Alt+ArrowUp', 'darwin')).toBe('⌥↑');
  });

  it('spells modifiers out on other platforms', () => {
    expect(formatStroke('Ctrl+Shift+ArrowRight', 'linux')).toBe('Ctrl+Shift+Right');
    expect(formatStroke('Meta+1', 'win32')).toBe('Super+1');
  });
});

describe('strokeProblem', () => {
  it('accepts shortcuts with a command modifier, and bare function keys', () => {
    expect(strokeProblem('Meta+1')).toBeUndefined();
    expect(strokeProblem('Alt+ArrowUp')).toBeUndefined();
    expect(strokeProblem('F7')).toBeUndefined();
    expect(strokeProblem('Shift+F7')).toBeUndefined();
  });

  it('rejects keys that would get in the way of typing', () => {
    expect(strokeProblem('J')).toEqual({ kind: 'needs-modifier' });
    expect(strokeProblem('Shift+J')).toEqual({ kind: 'needs-modifier' });
    expect(strokeProblem('ArrowDown')).toEqual({ kind: 'needs-modifier' });
  });

  it('keeps shortcuts that macOS and the editor already use', () => {
    expect(strokeProblem('Meta+Q')).toEqual({ kind: 'reserved', use: 'quits the app' });
    expect(strokeProblem('Meta+F')).toEqual({ kind: 'reserved', use: 'finds in the file' });
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
