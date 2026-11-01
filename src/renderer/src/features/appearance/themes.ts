import type { editor } from 'monaco-editor/editor.js';

export type ThemeId = 'light' | 'dark' | 'darcula';

export type ThemeKind = 'light' | 'dark';

export const UI_COLORS = [
  'color-bg-editor',
  'color-bg-panel',
  'color-bg-hover',
  'color-bg-selected',
  'color-bg-input',
  'color-border',
  'color-border-strong',
  'color-text',
  'color-text-muted',
  'color-accent',
  'color-focus',
  'color-success',
  'color-danger',
  'color-merged',
  'color-status-added',
  'color-status-modified',
  'color-status-deleted',
  'diff-inserted-line',
  'diff-inserted-marker',
  'diff-modified-line',
  'diff-modified-word',
  'diff-modified-marker',
  'diff-deleted-line',
  'diff-deleted-marker',
] as const;

export type UiColor = (typeof UI_COLORS)[number];

export interface Theme {
  id: ThemeId;
  name: string;
  kind: ThemeKind;
  ui: Record<UiColor, string>;
  syntax: editor.ITokenThemeRule[];
  editor: editor.IColors;
  unifiedWords: { inserted: string; removed: string };
}

const LIGHT: Theme = {
  id: 'light',
  name: 'Light',
  kind: 'light',
  ui: {
    'color-bg-editor': '#ffffff',
    'color-bg-panel': '#f7f8fa',
    'color-bg-hover': '#ebecf0',
    'color-bg-selected': '#d4e2ff',
    'color-bg-input': '#ffffff',
    'color-border': '#ebecf0',
    'color-border-strong': '#c9ccd6',
    'color-text': '#1e1f22',
    'color-text-muted': '#6c707e',
    'color-accent': '#2459b7',
    'color-focus': '#2459b7',
    'color-success': '#17662b',
    'color-danger': '#b32636',
    'color-merged': '#834dff',
    'color-status-added': '#17662b',
    'color-status-modified': '#2459b7',
    'color-status-deleted': '#555b68',
    'diff-inserted-line': '#e3f2df',
    'diff-inserted-marker': '#5fb865',
    'diff-modified-line': '#e2ebfc',
    'diff-modified-word': '#c3d6fb',
    'diff-modified-marker': '#4c86f7',
    'diff-deleted-line': '#ececec',
    'diff-deleted-marker': '#a8adbd',
  },
  syntax: [
    { token: '', foreground: '080808' },
    { token: 'keyword', foreground: '0033b3' },
    { token: 'string', foreground: '066a14' },
    { token: 'number', foreground: '1750eb' },
    { token: 'comment', foreground: '707070', fontStyle: 'italic' },
    { token: 'annotation', foreground: '9e880d' },
    { token: 'tag', foreground: '0033b3' },
    { token: 'attribute.name', foreground: '174ad4' },
    { token: 'regexp', foreground: '264eff' },
    { token: 'constant', foreground: '871094' },
  ],
  editor: {
    'editor.foreground': '#080808',
    'editorLineNumber.foreground': '#aeb3c2',
    'editorLineNumber.activeForeground': '#767a8a',
    'editor.lineHighlightBackground': '#f5f8fe',
    'editor.selectionBackground': '#a6d2ff',
    'diffEditor.border': '#ebecf0',
    'diffEditor.diagonalFill': '#e4e6eb80',
    'diffEditor.unchangedRegionBackground': '#f7f8fa',
    'diffEditor.unchangedRegionForeground': '#6c707e',
    'diffEditor.unchangedCodeBackground': '#00000000',
  },
  unifiedWords: { inserted: '#c1e3b8', removed: '#d6d6d6' },
};

const DARK: Theme = {
  id: 'dark',
  name: 'Dark',
  kind: 'dark',
  ui: {
    'color-bg-editor': '#1e1f22',
    'color-bg-panel': '#2b2d30',
    'color-bg-hover': '#393b40',
    'color-bg-selected': '#2e436e',
    'color-bg-input': '#1e1f22',
    'color-border': '#1e1f22',
    'color-border-strong': '#43454a',
    'color-text': '#dfe1e5',
    'color-text-muted': '#868a91',
    'color-accent': '#548af7',
    'color-focus': '#548af7',
    'color-success': '#57965c',
    'color-danger': '#db5c5c',
    'color-merged': '#a571e6',
    'color-status-added': '#73bd79',
    'color-status-modified': '#6aa6f8',
    'color-status-deleted': '#868a91',
    'diff-inserted-line': '#294436',
    'diff-inserted-marker': '#549159',
    'diff-modified-line': '#2f4462',
    'diff-modified-word': '#43648f',
    'diff-modified-marker': '#4a7fd6',
    'diff-deleted-line': '#3d3f41',
    'diff-deleted-marker': '#6f737a',
  },
  syntax: [
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
  editor: {
    'editor.foreground': '#bcbec4',
    'editorLineNumber.foreground': '#4b5059',
    'editorLineNumber.activeForeground': '#a1a3ab',
    'editor.lineHighlightBackground': '#26282e',
    'editor.selectionBackground': '#214283',
    'diffEditor.border': '#393b40',
    'diffEditor.diagonalFill': '#2b2d3080',
    'diffEditor.unchangedRegionBackground': '#2b2d30',
    'diffEditor.unchangedRegionForeground': '#868a91',
    'diffEditor.unchangedCodeBackground': '#00000000',
  },
  unifiedWords: { inserted: '#3e6b4c', removed: '#55585b' },
};

const DARCULA: Theme = {
  id: 'darcula',
  name: 'Darcula',
  kind: 'dark',
  ui: {
    'color-bg-editor': '#2b2b2b',
    'color-bg-panel': '#3c3f41',
    'color-bg-hover': '#4b4f52',
    'color-bg-selected': '#214283',
    'color-bg-input': '#45494a',
    'color-border': '#323232',
    'color-border-strong': '#5e6060',
    'color-text': '#bbbbbb',
    'color-text-muted': '#8c8c8c',
    'color-accent': '#589df6',
    'color-focus': '#589df6',
    'color-success': '#499c54',
    'color-danger': '#c75450',
    'color-merged': '#9876aa',
    'color-status-added': '#629755',
    'color-status-modified': '#6897bb',
    'color-status-deleted': '#8c8c8c',
    'diff-inserted-line': '#294436',
    'diff-inserted-marker': '#447152',
    'diff-modified-line': '#385570',
    'diff-modified-word': '#43698d',
    'diff-modified-marker': '#6897bb',
    'diff-deleted-line': '#484a4a',
    'diff-deleted-marker': '#656e76',
  },
  syntax: [
    { token: '', foreground: 'a9b7c6' },
    { token: 'keyword', foreground: 'cc7832' },
    { token: 'string', foreground: '6a8759' },
    { token: 'number', foreground: '6897bb' },
    { token: 'comment', foreground: '808080' },
    { token: 'annotation', foreground: 'bbb529' },
    { token: 'tag', foreground: 'e8bf6a' },
    { token: 'attribute.name', foreground: 'bababa' },
    { token: 'regexp', foreground: '6a8759' },
    { token: 'constant', foreground: '9876aa' },
  ],
  editor: {
    'editor.foreground': '#a9b7c6',
    'editorLineNumber.foreground': '#606366',
    'editorLineNumber.activeForeground': '#a4a3a3',
    'editor.lineHighlightBackground': '#323232',
    'editor.selectionBackground': '#214283',
    'diffEditor.border': '#323232',
    'diffEditor.diagonalFill': '#3c3f4180',
    'diffEditor.unchangedRegionBackground': '#313335',
    'diffEditor.unchangedRegionForeground': '#808080',
    'diffEditor.unchangedCodeBackground': '#00000000',
  },
  unifiedWords: { inserted: '#36573f', removed: '#5a5c5c' },
};

export const THEMES: readonly Theme[] = [LIGHT, DARK, DARCULA];

export function themeById(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? LIGHT;
}
