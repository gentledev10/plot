import { type FontStyle, isFontFamily, isFontWeight } from '@shared/fonts';

export interface FontFileInfo {
  family: string;
  weight: number;
  style: FontStyle;
  format: 'ttf' | 'otf';
}

interface Table {
  offset: number;
  length: number;
}

const TRUETYPE = 0x00010000;
const APPLE_TRUETYPE = 0x74727565;
const OPENTYPE = 0x4f54544f;

const FAMILY = 1;
const TYPOGRAPHIC_FAMILY = 16;
const WINDOWS = 3;
const ENGLISH_US = 0x409;

export function readFontFile(bytes: Uint8Array): FontFileInfo | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 12) {
    return undefined;
  }
  const version = view.getUint32(0);
  if (version !== TRUETYPE && version !== APPLE_TRUETYPE && version !== OPENTYPE) {
    return undefined;
  }
  const tables = readTables(view);
  const family = tables && cleanFamily(readFamily(view, tables.get('name')));
  if (!tables || !family) {
    return undefined;
  }
  return {
    family,
    ...readStyle(view, tables),
    format: version === OPENTYPE ? 'otf' : 'ttf',
  };
}

function readTables(view: DataView): Map<string, Table> | undefined {
  const count = view.getUint16(4);
  if (12 + count * 16 > view.byteLength) {
    return undefined;
  }
  const tables = new Map<string, Table>();
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length > view.byteLength) {
      return undefined;
    }
    tables.set(tag, { offset, length });
  }
  return tables;
}

function readFamily(view: DataView, table: Table | undefined): string | undefined {
  if (!table || table.length < 6) {
    return undefined;
  }
  const end = table.offset + table.length;
  const count = view.getUint16(table.offset + 2);
  const storage = table.offset + view.getUint16(table.offset + 4);
  let best: { nameId: number; rank: number; text: string } | undefined;
  for (let index = 0; index < count; index += 1) {
    const record = table.offset + 6 + index * 12;
    if (record + 12 > end) {
      break;
    }
    const platform = view.getUint16(record);
    const language = view.getUint16(record + 4);
    const nameId = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const start = storage + view.getUint16(record + 10);
    if ((nameId !== FAMILY && nameId !== TYPOGRAPHIC_FAMILY) || start + length > end) {
      continue;
    }
    const text = decodeName(view, platform, start, length);
    const rank = rankOf(platform, language);
    if (text && (!best || nameId > best.nameId || (nameId === best.nameId && rank < best.rank))) {
      best = { nameId, rank, text };
    }
  }
  return best?.text;
}

function rankOf(platform: number, language: number): number {
  if (platform === WINDOWS) {
    return language === ENGLISH_US ? 0 : 1;
  }
  return platform === 0 ? 2 : 3;
}

function decodeName(
  view: DataView,
  platform: number,
  start: number,
  length: number,
): string | undefined {
  const units: number[] = [];
  if (platform === 0 || platform === WINDOWS) {
    for (let at = start; at + 1 < start + length; at += 2) {
      units.push(view.getUint16(at));
    }
  } else {
    for (let at = start; at < start + length; at += 1) {
      const byte = view.getUint8(at);
      if (byte >= 0x80) {
        return undefined;
      }
      units.push(byte);
    }
  }
  return String.fromCharCode(...units);
}

function cleanFamily(name: string | undefined): string | undefined {
  const family = name
    ?.replace(/[^\p{L}\p{N} ._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .trim();
  return isFontFamily(family) ? family : undefined;
}

function readStyle(
  view: DataView,
  tables: Map<string, Table>,
): Pick<FontFileInfo, 'weight' | 'style'> {
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  const weight = os2 && os2.length >= 6 ? view.getUint16(os2.offset + 4) : 400;
  const italic =
    os2 && os2.length >= 64
      ? (view.getUint16(os2.offset + 62) & 0x1) !== 0
      : head !== undefined && head.length >= 46 && (view.getUint16(head.offset + 44) & 0x2) !== 0;
  return { weight: isFontWeight(weight) ? weight : 400, style: italic ? 'italic' : 'normal' };
}
