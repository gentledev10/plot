import { useSyncExternalStore } from 'react';

export type ColorScheme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function snapshot(): ColorScheme {
  return window.matchMedia(QUERY).matches ? 'dark' : 'light';
}

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, snapshot);
}
