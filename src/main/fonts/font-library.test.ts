import { mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fontFile } from './font-fixtures';
import { createFontLibrary, MAX_FONT_BYTES } from './font-library';

let root: string;
let dir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plot-fonts-'));
  dir = join(root, 'fonts');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function file(name: string, bytes: Uint8Array): Promise<string> {
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}

describe('createFontLibrary', () => {
  it('keeps copies of the added files and lists their faces', async () => {
    const regular = await file('Hack-Regular.ttf', fontFile({ family: 'Hack' }));
    const bold = await file('Hack-Bold.ttf', fontFile({ family: 'Hack', weight: 700 }));

    const added = await createFontLibrary(dir).add([regular, bold]);

    expect(added).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{16}$/), family: 'Hack', weight: 400, style: 'normal' },
      { id: expect.stringMatching(/^[0-9a-f]{16}$/), family: 'Hack', weight: 700, style: 'normal' },
    ]);
    const library = createFontLibrary(dir);
    await expect(library.list()).resolves.toEqual(added);
    await rm(regular);
    await expect(library.read(added[0]?.id ?? '')).resolves.toEqual(
      Buffer.from(fontFile({ family: 'Hack' })),
    );
  });

  it('replaces a face that is added again from another file', async () => {
    const library = createFontLibrary(dir);
    const [first] = await library.add([await file('old.ttf', fontFile({ family: 'Hack' }))]);
    const names = [
      { platform: 3, language: 0x409, nameId: 1, text: 'Hack' },
      { platform: 1, language: 0, nameId: 1, text: 'Hack' },
    ];
    const [second] = await library.add([await file('new.ttf', fontFile({ names }))]);

    expect(second?.id).not.toBe(first?.id);
    await expect(library.list()).resolves.toEqual([second]);
    expect((await readdir(dir)).sort()).toEqual([`${second?.id}.ttf`, 'fonts.json']);
  });

  it('keeps one copy of a file added twice', async () => {
    const library = createFontLibrary(dir);
    const path = await file('Hack-Regular.ttf', fontFile());
    await library.add([path]);
    await library.add([path]);

    expect(await library.list()).toHaveLength(1);
    expect(await readdir(dir)).toHaveLength(2);
  });

  it('removes every face of a family and its files', async () => {
    const library = createFontLibrary(dir);
    await library.add([
      await file('a.ttf', fontFile({ family: 'Hack' })),
      await file('b.ttf', fontFile({ family: 'Hack', italic: true })),
      await file('c.otf', fontFile({ family: 'Victor Mono', format: 'otf' })),
    ]);

    await library.remove('Hack');

    const fonts = await library.list();
    expect(fonts.map((font) => font.family)).toEqual(['Victor Mono']);
    expect((await readdir(dir)).sort()).toEqual([`${fonts[0]?.id}.otf`, 'fonts.json']);
  });

  it('adds none of the files when one of them is not a font', async () => {
    const library = createFontLibrary(dir);
    const font = await file('Hack-Regular.ttf', fontFile());
    const notes = await file('notes.ttf', new TextEncoder().encode('not a font'));

    await expect(library.add([font, notes])).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'notes.ttf is not a TrueType or OpenType font.',
    });
    await expect(library.list()).resolves.toEqual([]);
  });

  it('refuses files larger than 32 MB', async () => {
    const big = await file('big.ttf', fontFile());
    await truncate(big, MAX_FONT_BYTES + 1);

    await expect(createFontLibrary(dir).add([big])).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'big.ttf is larger than 32 MB.',
    });
  });

  it('says when a font is no longer in the library', async () => {
    await expect(createFontLibrary(dir).read('0123456789abcdef')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('treats a corrupted list as empty', async () => {
    const library = createFontLibrary(dir);
    await library.add([await file('a.ttf', fontFile())]);
    await writeFile(join(dir, 'fonts.json'), '{not json');

    await expect(createFontLibrary(dir).list()).resolves.toEqual([]);
  });
});
