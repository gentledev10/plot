import type { BlobContent, ChangedFile, FileKind, FileStatus } from '@shared/diff';

export interface RawEntry {
  oldMode: string;
  newMode: string;
  oldBlob: string;
  newBlob: string;
  status: string;
  path: string;
  previousPath?: string;
}

export interface NumstatEntry {
  path: string;
  additions: number | null;
  deletions: number | null;
}

const RAW_HEADER = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/;
const NUMSTAT_RECORD = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/;

export function parseRawDiff(output: string): RawEntry[] {
  const fields = output.split('\0');
  const entries: RawEntry[] = [];
  let index = 0;
  while (index < fields.length) {
    const header = fields[index++];
    if (!header) {
      continue;
    }
    const match = RAW_HEADER.exec(header);
    if (!match) {
      throw new Error(`Unexpected git diff --raw output: ${header}`);
    }
    const [, oldMode = '', newMode = '', oldBlob = '', newBlob = '', status = ''] = match;
    const first = fields[index++] ?? '';
    if (status === 'R' || status === 'C') {
      const second = fields[index++] ?? '';
      entries.push({
        oldMode,
        newMode,
        oldBlob,
        newBlob,
        status,
        previousPath: first,
        path: second,
      });
    } else {
      entries.push({ oldMode, newMode, oldBlob, newBlob, status, path: first });
    }
  }
  return entries;
}

export function parseNumstat(output: string): NumstatEntry[] {
  const fields = output.split('\0');
  const entries: NumstatEntry[] = [];
  let index = 0;
  while (index < fields.length) {
    const record = fields[index++];
    if (!record) {
      continue;
    }
    const match = NUMSTAT_RECORD.exec(record);
    if (!match) {
      throw new Error(`Unexpected git diff --numstat output: ${record}`);
    }
    const [, added = '-', deleted = '-', inlinePath = ''] = match;
    let path = inlinePath;
    if (path === '') {
      index++;
      path = fields[index++] ?? '';
    }
    entries.push({ path, additions: count(added), deletions: count(deleted) });
  }
  return entries;
}

export function toChangedFiles(raw: RawEntry[], numstat: NumstatEntry[]): ChangedFile[] {
  const counts = new Map(numstat.map((entry) => [entry.path, entry]));
  return raw.map((entry) => {
    const stats = counts.get(entry.path);
    const file: ChangedFile = {
      path: entry.path,
      status: STATUS[entry.status] ?? 'modified',
      kind: fileKind(entry.status === 'D' ? entry.oldMode : entry.newMode),
      oldBlob: isZero(entry.oldBlob) ? null : entry.oldBlob,
      newBlob: isZero(entry.newBlob) ? null : entry.newBlob,
      additions: stats?.additions ?? null,
      deletions: stats?.deletions ?? null,
    };
    if (entry.previousPath !== undefined) {
      file.previousPath = entry.previousPath;
    }
    return file;
  });
}

const BINARY_SNIFF_BYTES = 8000;

export function classifyBlob(content: Buffer): BlobContent {
  if (content.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    return { kind: 'binary', size: content.length };
  }
  return { kind: 'text', text: new TextDecoder('utf-8').decode(content) };
}

const STATUS: Record<string, FileStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
};

function fileKind(mode: string): FileKind {
  if (mode === '120000') {
    return 'symlink';
  }
  if (mode === '160000') {
    return 'submodule';
  }
  return 'file';
}

function count(value: string): number | null {
  return value === '-' ? null : Number(value);
}

function isZero(objectId: string): boolean {
  return /^0+$/.test(objectId);
}
