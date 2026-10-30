import { useCallback, useState } from 'react';

const PREFIX = 'viewer.';

export function readPreference<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(PREFIX + key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState(() => readPreference(key, fallback));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      writePreference(key, next);
    },
    [key],
  );
  return [value, update];
}
