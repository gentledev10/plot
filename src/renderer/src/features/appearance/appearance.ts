import type { ThemeSource } from '@shared/appearance';
import type { editor } from 'monaco-editor/editor.js';
import { THEMES, type Theme, type ThemeId, themeById, type UiColor } from './themes';

export type ThemeChoice = 'system' | ThemeId;

export interface CodeFont {
  family: string;
  size: number;
}

export const CUSTOM_COLORS = [
  { id: 'diff-inserted-line', label: 'Inserted lines' },
  { id: 'diff-inserted-marker', label: 'Inserted markers' },
  { id: 'diff-modified-line', label: 'Modified lines' },
  { id: 'diff-modified-word', label: 'Modified text' },
  { id: 'diff-modified-marker', label: 'Modified markers' },
  { id: 'diff-deleted-line', label: 'Deleted lines' },
  { id: 'diff-deleted-marker', label: 'Deleted markers' },
  { id: 'color-bg-editor', label: 'Editor background' },
  { id: 'color-accent', label: 'Accent' },
] as const satisfies readonly { id: UiColor; label: string }[];

export type CustomColor = (typeof CUSTOM_COLORS)[number]['id'];

export type ColorOverrides = Partial<Record<CustomColor, string>>;

export interface Appearance {
  theme: ThemeChoice;
  codeFont: CodeFont;
  colors: Partial<Record<ThemeId, ColorOverrides>>;
}

export const FONT_SIZE = { min: 10, max: 24 } as const;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  codeFont: { family: 'JetBrains Mono', size: 13 },
  colors: {},
};

const COLOR = /^#[0-9a-f]{6}$/i;
const FONT_FAMILY = /^[\p{L}\p{N} ._-]{1,64}$/u;

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR.test(value);
}

export function isFontFamily(value: unknown): value is string {
  return typeof value === 'string' && FONT_FAMILY.test(value) && value.trim() !== '';
}

export function clampFontSize(size: number): number {
  return Math.round(Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, size)));
}

export function parseAppearance(stored: unknown): Appearance | undefined {
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const { theme, codeFont, colors } = stored as Record<string, unknown>;
  const font = (typeof codeFont === 'object' && codeFont !== null ? codeFont : {}) as Record<
    string,
    unknown
  >;
  const parsed: Appearance = {
    theme:
      theme === 'system' || THEMES.some((candidate) => candidate.id === theme)
        ? (theme as ThemeChoice)
        : DEFAULT_APPEARANCE.theme,
    codeFont: {
      family: isFontFamily(font.family) ? font.family.trim() : DEFAULT_APPEARANCE.codeFont.family,
      size:
        typeof font.size === 'number' && Number.isFinite(font.size)
          ? clampFontSize(font.size)
          : DEFAULT_APPEARANCE.codeFont.size,
    },
    colors: {},
  };
  if (typeof colors === 'object' && colors !== null) {
    for (const theme of THEMES) {
      const overrides = parseOverrides((colors as Record<string, unknown>)[theme.id]);
      if (overrides) {
        parsed.colors[theme.id] = overrides;
      }
    }
  }
  return parsed;
}

function parseOverrides(value: unknown): ColorOverrides | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const overrides: ColorOverrides = {};
  for (const { id } of CUSTOM_COLORS) {
    const color = (value as Record<string, unknown>)[id];
    if (isColor(color)) {
      overrides[id] = color.toLowerCase();
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function resolveTheme(choice: ThemeChoice, system: 'light' | 'dark'): Theme {
  return themeById(choice === 'system' ? system : choice);
}

export function themeSourceFor(choice: ThemeChoice): ThemeSource {
  return choice === 'system' ? 'system' : themeById(choice).kind;
}

export function themeColors(theme: Theme, overrides: ColorOverrides = {}): Record<UiColor, string> {
  const colors = { ...theme.ui, ...overrides };
  if (overrides['color-accent']) {
    colors['color-focus'] = overrides['color-accent'];
  }
  return colors;
}

export function codeFontStack(family: string): string {
  return `"${family}", "JetBrains Mono", ui-monospace, Menlo, monospace`;
}

export function cssVariables(
  colors: Record<UiColor, string>,
  font: CodeFont,
): Record<string, string> {
  const variables: Record<string, string> = { '--font-code': codeFontStack(font.family) };
  for (const [name, value] of Object.entries(colors)) {
    variables[`--${name}`] = value;
  }
  return variables;
}

const TRANSPARENT = '#00000000';

// Side-by-side views draw IntelliJ's colors with decorations, which need to know whether a
// block was inserted, deleted, or edited. Monaco's own colors only know the side.
const SPLIT_DIFF: editor.IColors = {
  'diffEditor.insertedLineBackground': TRANSPARENT,
  'diffEditor.insertedTextBackground': TRANSPARENT,
  'diffEditor.removedLineBackground': TRANSPARENT,
  'diffEditor.removedTextBackground': TRANSPARENT,
  'diffEditorGutter.insertedLineBackground': TRANSPARENT,
  'diffEditorGutter.removedLineBackground': TRANSPARENT,
  'diffEditorOverview.insertedForeground': TRANSPARENT,
  'diffEditorOverview.removedForeground': TRANSPARENT,
};

export function editorTheme(
  theme: Theme,
  colors: Record<UiColor, string>,
  sideBySide: boolean,
): editor.IStandaloneThemeData {
  const diff = sideBySide
    ? SPLIT_DIFF
    : {
        'diffEditor.insertedLineBackground': colors['diff-inserted-line'],
        'diffEditor.insertedTextBackground': theme.unifiedWords.inserted,
        'diffEditor.removedLineBackground': colors['diff-deleted-line'],
        'diffEditor.removedTextBackground': theme.unifiedWords.removed,
      };
  return {
    base: theme.kind === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: theme.syntax,
    colors: {
      ...theme.editor,
      'editor.background': colors['color-bg-editor'],
      'editorGutter.background': colors['color-bg-editor'],
      ...diff,
    },
  };
}

export function editorThemeName(data: editor.IStandaloneThemeData): string {
  let hash = 5381;
  for (const character of JSON.stringify(data)) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return `viewer-${hash.toString(36)}`;
}
