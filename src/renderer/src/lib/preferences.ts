import { useCallback, useState } from 'react';

const PREFIX = 'viewer.';

export type PreferenceParser<T> = (stored: unknown) => T | undefined;

export function readPreference<T>(key: string, fallback: T, parse?: PreferenceParser<T>): T {
  try {
    const stored = localStorage.getItem(PREFIX + key);
    if (stored === null) {
      return fallback;
    }
    const value: unknown = JSON.parse(stored);
    return parse ? (parse(value) ?? fallback) : (value as T);
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function usePreference<T>(
  key: string,
  fallback: T,
  parse?: PreferenceParser<T>,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => readPreference(key, fallback, parse));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      writePreference(key, next);
    },
    [key],
  );
  return [value, update];
}
