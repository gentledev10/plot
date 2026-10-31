import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readPreference, usePreference, writePreference } from './preferences';

beforeEach(() => {
  localStorage.clear();
});

describe('preferences', () => {
  it('returns the fallback until a value is stored', () => {
    expect(readPreference('diff.collapse', true)).toBe(true);
    writePreference('diff.collapse', false);
    expect(readPreference('diff.collapse', true)).toBe(false);
  });

  it('namespaces keys so they do not collide with other storage', () => {
    writePreference('diff.collapse', false);
    expect(localStorage.getItem('viewer.diff.collapse')).toBe('false');
  });

  it('ignores corrupted values', () => {
    localStorage.setItem('viewer.diff.collapse', '{not json');
    expect(readPreference('diff.collapse', true)).toBe(true);
  });

  it('falls back when a parser rejects the stored value', () => {
    const parse = (value: unknown) => (typeof value === 'boolean' ? value : undefined);
    localStorage.setItem('viewer.diff.collapse', '"yes"');
    expect(readPreference('diff.collapse', true, parse)).toBe(true);
    localStorage.setItem('viewer.diff.collapse', 'false');
    expect(readPreference('diff.collapse', true, parse)).toBe(false);
  });

  it('keeps the hook state and storage in sync', () => {
    const { result, unmount } = renderHook(() => usePreference('diff.sideBySide', true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    unmount();

    const { result: next } = renderHook(() => usePreference('diff.sideBySide', true));
    expect(next.current[0]).toBe(false);
  });
});
