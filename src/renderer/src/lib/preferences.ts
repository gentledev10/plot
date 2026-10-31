import { useCallback, useState } from 'react';

export type PreferenceParser<T> = (stored: unknown) => T | undefined;

type Save = (key: string, value: unknown) => void;

let values = new Map<string, unknown>();
let save: Save = () => {};

// The main process keeps preferences in a file, because Chromium does not keep localStorage
// for the app's own page across restarts. They are loaded once before the first render.
export function initializePreferences(initial: Record<string, unknown>, onSave: Save): void {
  values = new Map(Object.entries(initial));
  save = onSave;
}

export function readPreference<T>(key: string, fallback: T, parse?: PreferenceParser<T>): T {
  if (!values.has(key)) {
    return fallback;
  }
  const value = values.get(key);
  return parse ? (parse(value) ?? fallback) : (value as T);
}

export function writePreference<T>(key: string, value: T): void {
  values.set(key, value);
  save(key, value);
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
