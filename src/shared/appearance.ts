export const THEME_SOURCES = ['system', 'light', 'dark'] as const;

export type ThemeSource = (typeof THEME_SOURCES)[number];

export function isThemeSource(value: unknown): value is ThemeSource {
  return typeof value === 'string' && (THEME_SOURCES as readonly string[]).includes(value);
}
