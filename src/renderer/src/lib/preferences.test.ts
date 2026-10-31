import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  initializePreferences,
  readPreference,
  usePreference,
  writePreference,
} from './preferences';

describe('preferences', () => {
  it('returns the fallback until a value is stored', () => {
    initializePreferences({}, () => {});
    expect(readPreference('diff.collapse', true)).toBe(true);
    writePreference('diff.collapse', false);
    expect(readPreference('diff.collapse', true)).toBe(false);
  });

  it('starts from the values loaded from the main process and saves every change', () => {
    const save = vi.fn();
    initializePreferences({ 'diff.collapse': false }, save);

    expect(readPreference('diff.collapse', true)).toBe(false);
    writePreference('diff.sideBySide', true);
    expect(save).toHaveBeenCalledWith('diff.sideBySide', true);
  });

  it('falls back when a parser rejects the stored value', () => {
    const parse = (value: unknown) => (typeof value === 'boolean' ? value : undefined);
    initializePreferences({ 'diff.collapse': 'yes' }, () => {});
    expect(readPreference('diff.collapse', true, parse)).toBe(true);
    writePreference('diff.collapse', false);
    expect(readPreference('diff.collapse', true, parse)).toBe(false);
  });

  it('keeps the hook state and the saved value in sync', () => {
    initializePreferences({}, () => {});
    const { result, unmount } = renderHook(() => usePreference('diff.sideBySide', true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    unmount();

    const { result: next } = renderHook(() => usePreference('diff.sideBySide', true));
    expect(next.current[0]).toBe(false);
  });
});
