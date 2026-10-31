import type { ThemeSource } from '@shared/appearance';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useColorScheme } from '../../lib/color-scheme';
import { readPreference, usePreference } from '../../lib/preferences';
import {
  type Appearance,
  type CodeFont,
  cssVariables,
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
  themeColors,
  themeSourceFor,
} from './appearance';
import type { Theme, UiColor } from './themes';

const PREFERENCE = 'appearance';

interface AppearanceContextValue {
  appearance: Appearance;
  setAppearance(appearance: Appearance): void;
  theme: Theme;
  colors: Record<UiColor, string>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used inside <AppearanceProvider>');
  }
  return context;
}

function apply(root: HTMLElement, theme: Theme, colors: Record<UiColor, string>, font: CodeFont) {
  for (const [name, value] of Object.entries(cssVariables(colors, font))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.kind;
  root.dataset.theme = theme.id;
}

// Applies the saved appearance before the first render, so the window never flashes the default.
export function applySavedAppearance(root: HTMLElement = document.documentElement): void {
  const appearance = readPreference(PREFERENCE, DEFAULT_APPEARANCE, parseAppearance);
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = resolveTheme(appearance.theme, system);
  apply(root, theme, themeColors(theme, appearance.colors[theme.id]), appearance.codeFont);
}

interface AppearanceProviderProps {
  onThemeSource(source: ThemeSource): void;
  children: ReactNode;
}

export function AppearanceProvider({ onThemeSource, children }: AppearanceProviderProps) {
  const [appearance, setAppearance] = usePreference(
    PREFERENCE,
    DEFAULT_APPEARANCE,
    parseAppearance,
  );
  const system = useColorScheme();
  const theme = resolveTheme(appearance.theme, system);
  const overrides = appearance.colors[theme.id];
  const colors = useMemo(() => themeColors(theme, overrides), [theme, overrides]);
  const source = themeSourceFor(appearance.theme);
  const latestOnThemeSource = useRef(onThemeSource);
  latestOnThemeSource.current = onThemeSource;

  useLayoutEffect(() => {
    apply(document.documentElement, theme, colors, appearance.codeFont);
  }, [theme, colors, appearance.codeFont]);

  useEffect(() => {
    latestOnThemeSource.current(source);
  }, [source]);

  const value = useMemo(
    () => ({ appearance, setAppearance, theme, colors }),
    [appearance, setAppearance, theme, colors],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
