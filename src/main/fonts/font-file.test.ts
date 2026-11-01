import { describe, expect, it } from 'vitest';
import { readFontFile } from './font-file';
import { fontFile, sfnt } from './font-fixtures';

describe('readFontFile', () => {
  it('reads the family, weight, and style of a TrueType font', () => {
    expect(readFontFile(fontFile({ family: 'Hack', weight: 700, italic: true }))).toEqual({
      family: 'Hack',
      weight: 700,
      style: 'italic',
      format: 'ttf',
    });
  });

  it('reads an OpenType font with outlines in CFF', () => {
    expect(readFontFile(fontFile({ format: 'otf' }))).toMatchObject({
      family: 'Hack',
      weight: 400,
      style: 'normal',
      format: 'otf',
    });
  });

  it('groups light and heavy weights under their typographic family', () => {
    const names = [
      { platform: 3, language: 0x409, nameId: 1, text: 'Fira Code Light' },
      { platform: 3, language: 0x409, nameId: 16, text: 'Fira Code' },
    ];
    expect(readFontFile(fontFile({ names, weight: 300 }))).toMatchObject({
      family: 'Fira Code',
      weight: 300,
    });
  });

  it('prefers the English name over names in other languages', () => {
    const names = [
      { platform: 3, language: 0x412, nameId: 1, text: '디투코딩' },
      { platform: 1, language: 0, nameId: 1, text: 'D2Coding Mac' },
      { platform: 3, language: 0x409, nameId: 1, text: 'D2Coding' },
    ];
    expect(readFontFile(fontFile({ names }))?.family).toBe('D2Coding');
  });

  it('reads a name kept only in the Macintosh encoding', () => {
    const names = [{ platform: 1, language: 0, nameId: 1, text: 'Monaco' }];
    expect(readFontFile(fontFile({ names }))?.family).toBe('Monaco');
  });

  it('takes the style from the font header when the font has no OS/2 table', () => {
    expect(readFontFile(fontFile({ os2: false, macStyle: 0x2 }))).toMatchObject({
      weight: 400,
      style: 'italic',
    });
  });

  it('drops characters that cannot be part of a font name', () => {
    expect(readFontFile(fontFile({ family: 'Mono"; color: red' }))?.family).toBe('Mono color red');
  });

  it('refuses files that are not TrueType or OpenType fonts', () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, ...new Uint8Array(40)]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(readFontFile(woff2)).toBeUndefined();
    expect(readFontFile(png)).toBeUndefined();
    expect(readFontFile(new Uint8Array())).toBeUndefined();
  });

  it('refuses fonts whose tables run past the end of the file', () => {
    const font = fontFile();
    expect(readFontFile(font.subarray(0, 20))).toBeUndefined();
    expect(readFontFile(font.subarray(0, font.length - 8))).toBeUndefined();
  });

  it('refuses fonts without a family name', () => {
    expect(readFontFile(sfnt({ head: new Uint8Array(54) }))).toBeUndefined();
    expect(readFontFile(fontFile({ names: [] }))).toBeUndefined();
  });
});
