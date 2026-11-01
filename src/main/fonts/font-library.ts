import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type AddedFont, isFontFamily, isFontId, isFontStyle, isFontWeight } from '@shared/fonts';
import { AppError } from '../errors';
import { type FontFileInfo, readFontFile } from './font-file';

export const MAX_FONT_BYTES = 32 * 1024 * 1024;

export interface FontLibrary {
  list(): Promise<AddedFont[]>;
  add(paths: readonly string[]): Promise<AddedFont[]>;
  read(id: string): Promise<Uint8Array<ArrayBuffer>>;
  remove(family: string): Promise<void>;
}

interface StoredFont extends AddedFont {
  file: string;
}

export function createFontLibrary(dir: string): FontLibrary {
  const manifest = join(dir, 'fonts.json');
  let loading: Promise<StoredFont[]> | undefined;

  function load(): Promise<StoredFont[]> {
    loading ??= readFile(manifest, 'utf8')
      .then((text) => parse(JSON.parse(text)))
      .catch(() => []);
    return loading;
  }

  async function save(fonts: StoredFont[]): Promise<void> {
    loading = Promise.resolve(fonts);
    await mkdir(dir, { recursive: true });
    const temporary = `${manifest}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(fonts, null, 2));
    await rename(temporary, manifest);
  }

  return {
    async list() {
      return (await load()).map(toAddedFont);
    },

    async add(paths) {
      const candidates = await Promise.all(paths.map(readCandidate));
      await mkdir(dir, { recursive: true });
      const added: StoredFont[] = [];
      for (const { bytes, info } of candidates) {
        const id = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
        const file = `${id}.${info.format}`;
        await writeFile(join(dir, file), bytes);
        added.push({ id, family: info.family, weight: info.weight, style: info.style, file });
      }
      const fonts = await load();
      const replaced = fonts.filter((font) => added.some((face) => sameFace(face, font)));
      await save([...fonts.filter((font) => !replaced.includes(font)), ...added]);
      const kept = new Set(added.map((font) => font.file));
      await Promise.all(
        replaced
          .filter((font) => !kept.has(font.file))
          .map((font) => rm(join(dir, font.file), { force: true })),
      );
      return added.map(toAddedFont);
    },

    async read(id) {
      const font = (await load()).find((candidate) => candidate.id === id);
      if (!font) {
        throw new AppError('invalid-argument', 'That font is no longer in Plot.');
      }
      return readFile(join(dir, font.file));
    },

    async remove(family) {
      const fonts = await load();
      await save(fonts.filter((font) => font.family !== family));
      await Promise.all(
        fonts
          .filter((font) => font.family === family)
          .map((font) => rm(join(dir, font.file), { force: true })),
      );
    },
  };
}

async function readCandidate(path: string): Promise<{ bytes: Uint8Array; info: FontFileInfo }> {
  const name = basename(path);
  if ((await stat(path)).size > MAX_FONT_BYTES) {
    throw new AppError('invalid-argument', `${name} is larger than 32 MB.`);
  }
  const bytes = await readFile(path);
  const info = readFontFile(bytes);
  if (!info) {
    throw new AppError('invalid-argument', `${name} is not a TrueType or OpenType font.`);
  }
  return { bytes, info };
}

function sameFace(a: AddedFont, b: AddedFont): boolean {
  return a.id === b.id || (a.family === b.family && a.weight === b.weight && a.style === b.style);
}

function toAddedFont({ id, family, weight, style }: StoredFont): AddedFont {
  return { id, family, weight, style };
}

function parse(value: unknown): StoredFont[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const { id, family, weight, style, file } = (item ?? {}) as Record<string, unknown>;
    return isFontId(id) &&
      isFontFamily(family) &&
      isFontWeight(weight) &&
      isFontStyle(style) &&
      (file === `${id}.ttf` || file === `${id}.otf`)
      ? [{ id, family, weight, style, file }]
      : [];
  });
}
