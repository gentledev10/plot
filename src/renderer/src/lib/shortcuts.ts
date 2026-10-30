import { useEffect, useRef } from 'react';

export interface Shortcut {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  run(): void;
}

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

export function matchesShortcut(event: KeyEventLike, shortcut: Shortcut): boolean {
  return (
    event.key === shortcut.key &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.ctrlKey === Boolean(shortcut.ctrl) &&
    event.altKey === Boolean(shortcut.alt) &&
    event.metaKey === Boolean(shortcut.meta)
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const editable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable === true;
  return editable && target.closest('.monaco-editor') === null;
}

export function useShortcuts(shortcuts: readonly Shortcut[]): void {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      const shortcut = latest.current.find((candidate) => matchesShortcut(event, candidate));
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.run();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
