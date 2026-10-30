import type { ChangedFile } from '@shared/diff';
import { describe, expect, it } from 'vitest';
import { adjacentFile, decideNavigation } from './navigation';

function file(path: string): ChangedFile {
  return {
    path,
    status: 'modified',
    kind: 'file',
    oldBlob: null,
    newBlob: null,
    additions: 0,
    deletions: 0,
  };
}

const files = [file('a.ts'), file('b.ts'), file('c.ts')];

describe('decideNavigation', () => {
  it('moves within the file while there are changes left', () => {
    expect(
      decideNavigation({
        direction: 'next',
        moved: { index: 1, total: 3 },
        armed: 'next',
        neighbor: files[2],
      }),
    ).toEqual({ kind: 'moved', position: { index: 1, total: 3 } });
  });

  it('asks for a second press at the last change, like IntelliJ', () => {
    expect(
      decideNavigation({
        direction: 'next',
        moved: undefined,
        armed: undefined,
        neighbor: files[1],
      }),
    ).toEqual({ kind: 'armed', direction: 'next', file: files[1] });
  });

  it('opens the next file at its first change on the second press', () => {
    expect(
      decideNavigation({ direction: 'next', moved: undefined, armed: 'next', neighbor: files[1] }),
    ).toEqual({ kind: 'open-file', file: files[1], at: 'first' });
  });

  it('opens the previous file at its last change when going backwards', () => {
    expect(
      decideNavigation({
        direction: 'previous',
        moved: undefined,
        armed: 'previous',
        neighbor: files[0],
      }),
    ).toEqual({ kind: 'open-file', file: files[0], at: 'last' });
  });

  it('does not carry a press in one direction over to the other', () => {
    expect(
      decideNavigation({
        direction: 'previous',
        moved: undefined,
        armed: 'next',
        neighbor: files[0],
      }),
    ).toEqual({ kind: 'armed', direction: 'previous', file: files[0] });
  });

  it('stops at the first and last file', () => {
    expect(
      decideNavigation({ direction: 'next', moved: undefined, armed: 'next', neighbor: undefined }),
    ).toEqual({ kind: 'boundary', direction: 'next' });
  });
});

describe('adjacentFile', () => {
  it('returns the neighbor in tree order', () => {
    expect(adjacentFile(files, 'b.ts', 'next')).toBe(files[2]);
    expect(adjacentFile(files, 'b.ts', 'previous')).toBe(files[0]);
  });

  it('returns nothing past the ends or for unknown files', () => {
    expect(adjacentFile(files, 'c.ts', 'next')).toBeUndefined();
    expect(adjacentFile(files, 'a.ts', 'previous')).toBeUndefined();
    expect(adjacentFile(files, 'missing.ts', 'next')).toBeUndefined();
  });
});
