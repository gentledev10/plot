export interface NameRecord {
  platform: number;
  language: number;
  nameId: number;
  text: string;
}

interface FontFixture {
  family?: string;
  names?: NameRecord[];
  weight?: number;
  italic?: boolean;
  format?: 'ttf' | 'otf';
  os2?: boolean;
  macStyle?: number;
}

export function fontFile({
  family = 'Hack',
  names = [{ platform: 3, language: 0x409, nameId: 1, text: family }],
  weight = 400,
  italic = false,
  format = 'ttf',
  os2 = true,
  macStyle = 0,
}: FontFixture = {}): Uint8Array {
  const tables: Record<string, Uint8Array> = {
    head: headTable(macStyle),
    name: nameTable(names),
  };
  if (os2) {
    tables['OS/2'] = os2Table(weight, italic ? 0x1 : 0x40);
  }
  return sfnt(tables, format === 'otf' ? 0x4f54544f : 0x00010000);
}

export function sfnt(tables: Record<string, Uint8Array>, version = 0x00010000): Uint8Array {
  const tags = Object.keys(tables);
  const directory = 12 + tags.length * 16;
  const sizes = tags.map((tag) => Math.ceil((tables[tag]?.length ?? 0) / 4) * 4);
  const bytes = new Uint8Array(directory + sizes.reduce((total, size) => total + size, 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version);
  view.setUint16(4, tags.length);
  let offset = directory;
  tags.forEach((tag, index) => {
    const table = tables[tag] ?? new Uint8Array();
    const record = 12 + index * 16;
    for (let at = 0; at < 4; at += 1) {
      view.setUint8(record + at, tag.charCodeAt(at));
    }
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    bytes.set(table, offset);
    offset += sizes[index] ?? 0;
  });
  return bytes;
}

function nameTable(records: NameRecord[]): Uint8Array {
  const encoded = records.map(({ platform, text }) =>
    platform === 1
      ? new Uint8Array([...text].map((character) => character.charCodeAt(0)))
      : utf16(text),
  );
  const storage = 6 + records.length * 12;
  const bytes = new Uint8Array(storage + encoded.reduce((total, text) => total + text.length, 0));
  const view = new DataView(bytes.buffer);
  view.setUint16(2, records.length);
  view.setUint16(4, storage);
  let offset = 0;
  records.forEach((record, index) => {
    const text = encoded[index] ?? new Uint8Array();
    const at = 6 + index * 12;
    view.setUint16(at, record.platform);
    view.setUint16(at + 2, record.platform === 1 ? 0 : 1);
    view.setUint16(at + 4, record.language);
    view.setUint16(at + 6, record.nameId);
    view.setUint16(at + 8, text.length);
    view.setUint16(at + 10, offset);
    bytes.set(text, storage + offset);
    offset += text.length;
  });
  return bytes;
}

function utf16(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(index * 2, text.charCodeAt(index));
  }
  return bytes;
}

function os2Table(weight: number, selection: number): Uint8Array {
  const bytes = new Uint8Array(96);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4);
  view.setUint16(4, weight);
  view.setUint16(62, selection);
  return bytes;
}

function headTable(macStyle: number): Uint8Array {
  const bytes = new Uint8Array(54);
  new DataView(bytes.buffer).setUint16(44, macStyle);
  return bytes;
}
