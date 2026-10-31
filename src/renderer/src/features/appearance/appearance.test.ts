import { describe, expect, it } from 'vitest';
import {
  cssVariables,
  DEFAULT_APPEARANCE,
  editorTheme,
  editorThemeName,
  parseAppearance,
  resolveTheme,
  themeColors,
  themeSourceFor,
} from './appearance';
import { themeById } from './themes';

describe('parseAppearance', () => {
  it('keeps valid settings', () => {
    const stored = {
      theme: 'darcula',
      codeFont: { family: 'D2Coding', size: 15 },
      colors: { darcula: { 'diff-inserted-line': '#ABCDEF' } },
    };
    expect(parseAppearance(stored)).toEqual({
      theme: 'darcula',
      codeFont: { family: 'D2Coding', size: 15 },
      colors: { darcula: { 'diff-inserted-line': '#abcdef' } },
    });
  });

  it('replaces anything invalid with the default instead of failing', () => {
    expect(
      parseAppearance({
        theme: 'neon',
        codeFont: { family: 'Evil"; } body { display: none', size: 99 },
        colors: {
          light: { 'diff-inserted-line': 'red', 'color-text': '#000000' },
          sepia: { 'color-accent': '#123456' },
        },
      }),
    ).toEqual({
      theme: 'system',
      codeFont: { family: 'JetBrains Mono', size: 24 },
      colors: {},
    });
    expect(parseAppearance('dark')).toBeUndefined();
  });
});

describe('themes', () => {
  it('follows macOS for the system choice and maps each theme to light or dark', () => {
    expect(resolveTheme('system', 'dark').id).toBe('dark');
    expect(resolveTheme('darcula', 'light').id).toBe('darcula');
    expect(themeSourceFor('system')).toBe('system');
    expect(themeSourceFor('darcula')).toBe('dark');
    expect(themeSourceFor('light')).toBe('light');
  });

  it('applies color overrides, and the accent also marks focus', () => {
    const colors = themeColors(themeById('light'), {
      'color-accent': '#ff0000',
      'diff-deleted-line': '#eeeeee',
    });
    expect(colors['color-focus']).toBe('#ff0000');
    expect(colors['diff-deleted-line']).toBe('#eeeeee');
    expect(colors['color-text']).toBe(themeById('light').ui['color-text']);
  });

  it('exposes colors and the code font as CSS variables', () => {
    const variables = cssVariables(themeById('dark').ui, DEFAULT_APPEARANCE.codeFont);
    expect(variables['--color-bg-editor']).toBe('#1e1f22');
    expect(variables['--font-code']).toBe(
      '"JetBrains Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
    );
  });
});

describe('editorTheme', () => {
  const darcula = themeById('darcula');
  const colors = themeColors(darcula, {
    'color-bg-editor': '#101010',
    'diff-inserted-line': '#00ff00',
  });

  it('uses the custom colors in the editor and in the unified view', () => {
    const unified = editorTheme(darcula, colors, false);
    expect(unified.base).toBe('vs-dark');
    expect(unified.colors['editor.background']).toBe('#101010');
    expect(unified.colors['diffEditor.insertedLineBackground']).toBe('#00ff00');
  });

  it('turns Monaco diff colors off side by side, where decorations draw them', () => {
    expect(editorTheme(darcula, colors, true).colors['diffEditor.insertedLineBackground']).toBe(
      '#00000000',
    );
  });

  it('names each distinct theme differently, so Monaco picks up changes', () => {
    const name = editorThemeName(editorTheme(darcula, colors, true));
    expect(name).toBe(editorThemeName(editorTheme(darcula, colors, true)));
    expect(name).not.toBe(editorThemeName(editorTheme(darcula, colors, false)));
  });
});
