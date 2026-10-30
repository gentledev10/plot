import { describe, expect, it } from 'vitest';
import { classifyBlob, parseNumstat, parseRawDiff, toChangedFiles } from './parse';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);

function raw(...records: string[][]): string {
  return `${records.map((fields) => fields.join('\0')).join('\0')}\0`;
}

describe('parseRawDiff', () => {
  it('parses modified, added, and deleted files', () => {
    const output = raw(
      [`:100644 100644 ${A} ${B} M`, 'src/app.ts'],
      [`:000000 100644 ${ZERO} ${B} A`, 'src/new.ts'],
      [`:100644 000000 ${A} ${ZERO} D`, 'src/old.ts'],
    );
    expect(parseRawDiff(output)).toEqual([
      {
        oldMode: '100644',
        newMode: '100644',
        oldBlob: A,
        newBlob: B,
        status: 'M',
        path: 'src/app.ts',
      },
      {
        oldMode: '000000',
        newMode: '100644',
        oldBlob: ZERO,
        newBlob: B,
        status: 'A',
        path: 'src/new.ts',
      },
      {
        oldMode: '100644',
        newMode: '000000',
        oldBlob: A,
        newBlob: ZERO,
        status: 'D',
        path: 'src/old.ts',
      },
    ]);
  });

  it('reads both paths of renames and copies, dropping the similarity score', () => {
    const output = raw(
      [`:100644 100644 ${A} ${B} R086`, 'src/before.ts', 'src/after.ts'],
      [`:100644 100644 ${A} ${A} C100`, 'a.txt', 'b.txt'],
    );
    expect(parseRawDiff(output)).toMatchObject([
      { status: 'R', previousPath: 'src/before.ts', path: 'src/after.ts' },
      { status: 'C', previousPath: 'a.txt', path: 'b.txt' },
    ]);
  });

  it('keeps paths with spaces, tabs, and non-ASCII characters intact', () => {
    const output = raw([`:100644 100644 ${A} ${B} M`, 'docs/한글 문서\t(초안).md']);
    expect(parseRawDiff(output)[0]?.path).toBe('docs/한글 문서\t(초안).md');
  });

  it('returns nothing for an empty diff', () => {
    expect(parseRawDiff('')).toEqual([]);
  });

  it('fails loudly on output it does not understand', () => {
    expect(() => parseRawDiff('warning: something odd\0')).toThrow('Unexpected git diff --raw');
  });
});

describe('parseNumstat', () => {
  it('parses line counts', () => {
    expect(parseNumstat('12\t3\tsrc/app.ts\0' + '0\t40\tsrc/old.ts\0')).toEqual([
      { path: 'src/app.ts', additions: 12, deletions: 3 },
      { path: 'src/old.ts', additions: 0, deletions: 40 },
    ]);
  });

  it('reports binary files without counts', () => {
    expect(parseNumstat('-\t-\tassets/logo.png\0')).toEqual([
      { path: 'assets/logo.png', additions: null, deletions: null },
    ]);
  });

  it('uses the new path of renamed files', () => {
    expect(parseNumstat('2\t1\t\0src/before.ts\0src/after.ts\0' + '1\t1\tz.ts\0')).toEqual([
      { path: 'src/after.ts', additions: 2, deletions: 1 },
      { path: 'z.ts', additions: 1, deletions: 1 },
    ]);
  });
});

describe('toChangedFiles', () => {
  it('combines statuses, blobs, and line counts', () => {
    const files = toChangedFiles(
      parseRawDiff(
        raw(
          [`:100644 100644 ${A} ${B} M`, 'src/app.ts'],
          [`:000000 100644 ${ZERO} ${B} A`, 'src/new.ts'],
          [`:100644 000000 ${A} ${ZERO} D`, 'src/old.ts'],
          [`:100644 100644 ${A} ${B} R090`, 'src/before.ts', 'src/after.ts'],
        ),
      ),
      parseNumstat(
        '3\t1\tsrc/app.ts\0' +
          '10\t0\tsrc/new.ts\0' +
          '0\t7\tsrc/old.ts\0' +
          '1\t1\t\0src/before.ts\0src/after.ts\0',
      ),
    );

    expect(files).toEqual([
      {
        path: 'src/app.ts',
        status: 'modified',
        kind: 'file',
        oldBlob: A,
        newBlob: B,
        additions: 3,
        deletions: 1,
      },
      {
        path: 'src/new.ts',
        status: 'added',
        kind: 'file',
        oldBlob: null,
        newBlob: B,
        additions: 10,
        deletions: 0,
      },
      {
        path: 'src/old.ts',
        status: 'deleted',
        kind: 'file',
        oldBlob: A,
        newBlob: null,
        additions: 0,
        deletions: 7,
      },
      {
        path: 'src/after.ts',
        previousPath: 'src/before.ts',
        status: 'renamed',
        kind: 'file',
        oldBlob: A,
        newBlob: B,
        additions: 1,
        deletions: 1,
      },
    ]);
  });

  it('recognizes symlinks and submodules, even when deleted', () => {
    const files = toChangedFiles(
      parseRawDiff(
        raw(
          [`:000000 120000 ${ZERO} ${B} A`, 'link'],
          [`:160000 160000 ${A} ${B} M`, 'vendor/lib'],
          [`:120000 000000 ${A} ${ZERO} D`, 'old-link'],
        ),
      ),
      [],
    );
    expect(files.map((file) => file.kind)).toEqual(['symlink', 'submodule', 'symlink']);
  });

  it('leaves counts empty for binary files', () => {
    const files = toChangedFiles(
      parseRawDiff(raw([`:100644 100644 ${A} ${B} M`, 'logo.png'])),
      parseNumstat('-\t-\tlogo.png\0'),
    );
    expect(files[0]).toMatchObject({ additions: null, deletions: null });
  });
});

describe('classifyBlob', () => {
  it('decodes UTF-8 text', () => {
    expect(classifyBlob(Buffer.from('fun main() = println("안녕")\n'))).toEqual({
      kind: 'text',
      text: 'fun main() = println("안녕")\n',
    });
  });

  it('drops a UTF-8 byte order mark', () => {
    expect(classifyBlob(Buffer.from('﻿hello'))).toEqual({ kind: 'text', text: 'hello' });
  });

  it('treats content with NUL bytes as binary, like git does', () => {
    expect(classifyBlob(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toEqual({
      kind: 'binary',
      size: 6,
    });
  });
});
