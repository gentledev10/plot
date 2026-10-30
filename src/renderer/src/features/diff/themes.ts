import type { editor } from 'monaco-editor/editor.js';

export type ColorScheme = 'light' | 'dark';

const TRANSPARENT = '#00000000';

const SYNTAX: Record<ColorScheme, editor.ITokenThemeRule[]> = {
  dark: [
    { token: '', foreground: 'bcbec4' },
    { token: 'keyword', foreground: 'cf8e6d' },
    { token: 'string', foreground: '6aab73' },
    { token: 'number', foreground: '2aacb8' },
    { token: 'comment', foreground: '7a7e85' },
    { token: 'annotation', foreground: 'b3ae60' },
    { token: 'tag', foreground: 'd5b778' },
    { token: 'attribute.name', foreground: 'bababa' },
    { token: 'regexp', foreground: '42c3d4' },
    { token: 'constant', foreground: 'c77dbb' },
  ],
  light: [
    { token: '', foreground: '080808' },
    { token: 'keyword', foreground: '0033b3' },
    { token: 'string', foreground: '067d17' },
    { token: 'number', foreground: '1750eb' },
    { token: 'comment', foreground: '8c8c8c', fontStyle: 'italic' },
    { token: 'annotation', foreground: '9e880d' },
    { token: 'tag', foreground: '0033b3' },
    { token: 'attribute.name', foreground: '174ad4' },
    { token: 'regexp', foreground: '264eff' },
    { token: 'constant', foreground: '871094' },
  ],
};

const EDITOR: Record<ColorScheme, editor.IColors> = {
  dark: {
    'editor.background': '#1e1f22',
    'editor.foreground': '#bcbec4',
    'editorLineNumber.foreground': '#4b5059',
    'editorLineNumber.activeForeground': '#a1a3ab',
    'editor.lineHighlightBackground': '#26282e',
    'editor.selectionBackground': '#214283',
    'editorGutter.background': '#1e1f22',
    'diffEditor.border': '#393b40',
    'diffEditor.diagonalFill': '#2b2d3080',
    'diffEditor.unchangedRegionBackground': '#2b2d30',
    'diffEditor.unchangedRegionForeground': '#868a91',
    'diffEditor.unchangedCodeBackground': '#00000000',
  },
  light: {
    'editor.background': '#ffffff',
    'editor.foreground': '#080808',
    'editorLineNumber.foreground': '#aeb3c2',
    'editorLineNumber.activeForeground': '#767a8a',
    'editor.lineHighlightBackground': '#f5f8fe',
    'editor.selectionBackground': '#a6d2ff',
    'editorGutter.background': '#ffffff',
    'diffEditor.border': '#ebecf0',
    'diffEditor.diagonalFill': '#e4e6eb80',
    'diffEditor.unchangedRegionBackground': '#f7f8fa',
    'diffEditor.unchangedRegionForeground': '#6c707e',
    'diffEditor.unchangedCodeBackground': '#00000000',
  },
};

const UNIFIED_DIFF: Record<ColorScheme, editor.IColors> = {
  dark: {
    'diffEditor.insertedLineBackground': '#294436',
    'diffEditor.insertedTextBackground': '#3e6b4c',
    'diffEditor.removedLineBackground': '#3d3f41',
    'diffEditor.removedTextBackground': '#55585b',
  },
  light: {
    'diffEditor.insertedLineBackground': '#e3f2df',
    'diffEditor.insertedTextBackground': '#c1e3b8',
    'diffEditor.removedLineBackground': '#ececec',
    'diffEditor.removedTextBackground': '#d6d6d6',
  },
};

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

export function themeName(scheme: ColorScheme, sideBySide: boolean): string {
  return `viewer-${scheme}-${sideBySide ? 'split' : 'unified'}`;
}

export function themeDefinitions(): Array<{ name: string; data: editor.IStandaloneThemeData }> {
  return (['dark', 'light'] as const).flatMap((scheme) =>
    [true, false].map((sideBySide) => ({
      name: themeName(scheme, sideBySide),
      data: {
        base: scheme === 'dark' ? ('vs-dark' as const) : ('vs' as const),
        inherit: true,
        rules: SYNTAX[scheme],
        colors: { ...EDITOR[scheme], ...(sideBySide ? SPLIT_DIFF : UNIFIED_DIFF[scheme]) },
      },
    })),
  );
}
