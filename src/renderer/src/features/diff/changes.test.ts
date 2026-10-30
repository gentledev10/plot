import { describe, expect, it } from 'vitest';
import {
  anchorLine,
  changeDecorations,
  changeKind,
  findAdjacentChange,
  type LineChange,
} from './changes';

const inserted: LineChange = {
  originalStartLineNumber: 4,
  originalEndLineNumber: 0,
  modifiedStartLineNumber: 5,
  modifiedEndLineNumber: 7,
};

const deleted: LineChange = {
  originalStartLineNumber: 10,
  originalEndLineNumber: 12,
  modifiedStartLineNumber: 11,
  modifiedEndLineNumber: 0,
};

const modified: LineChange = {
  originalStartLineNumber: 20,
  originalEndLineNumber: 20,
  modifiedStartLineNumber: 19,
  modifiedEndLineNumber: 20,
  charChanges: [
    {
      originalStartLineNumber: 20,
      originalStartColumn: 5,
      originalEndLineNumber: 20,
      originalEndColumn: 9,
      modifiedStartLineNumber: 19,
      modifiedStartColumn: 5,
      modifiedEndLineNumber: 19,
      modifiedEndColumn: 12,
    },
    {
      originalStartLineNumber: 20,
      originalStartColumn: 15,
      originalEndLineNumber: 20,
      originalEndColumn: 15,
      modifiedStartLineNumber: 20,
      modifiedStartColumn: 1,
      modifiedEndLineNumber: 20,
      modifiedEndColumn: 30,
    },
  ],
};

describe('changeKind', () => {
  it('follows IntelliJ: green for insertions, gray for deletions, blue for edits', () => {
    expect(changeKind(inserted)).toBe('inserted');
    expect(changeKind(deleted)).toBe('deleted');
    expect(changeKind(modified)).toBe('modified');
  });
});

describe('anchorLine', () => {
  it('uses the first changed line on the new side', () => {
    expect(anchorLine(inserted)).toBe(5);
    expect(anchorLine(modified)).toBe(19);
  });

  it('points at the line where deleted lines used to be', () => {
    expect(anchorLine(deleted)).toBe(11);
    expect(anchorLine({ ...deleted, modifiedStartLineNumber: 0 })).toBe(1);
  });
});

describe('findAdjacentChange', () => {
  const changes = [inserted, deleted, modified];

  it('finds the next change after the cursor', () => {
    expect(findAdjacentChange(changes, 1, 'next')).toBe(0);
    expect(findAdjacentChange(changes, 5, 'next')).toBe(1);
    expect(findAdjacentChange(changes, 12, 'next')).toBe(2);
  });

  it('finds the previous change before the cursor', () => {
    expect(findAdjacentChange(changes, 30, 'previous')).toBe(2);
    expect(findAdjacentChange(changes, 19, 'previous')).toBe(1);
    expect(findAdjacentChange(changes, 11, 'previous')).toBe(0);
  });

  it('reports the ends of the file, so the caller can move to another file', () => {
    expect(findAdjacentChange(changes, 19, 'next')).toBeUndefined();
    expect(findAdjacentChange(changes, 5, 'previous')).toBeUndefined();
    expect(findAdjacentChange([], 1, 'next')).toBeUndefined();
  });
});

describe('changeDecorations', () => {
  it('colors whole lines on each side that has lines', () => {
    expect(changeDecorations([inserted, deleted], 'modified')).toEqual([
      {
        kind: 'inserted',
        wholeLine: true,
        startLineNumber: 5,
        startColumn: 1,
        endLineNumber: 7,
        endColumn: 1,
      },
    ]);
    expect(changeDecorations([inserted, deleted], 'original')).toEqual([
      {
        kind: 'deleted',
        wholeLine: true,
        startLineNumber: 10,
        startColumn: 1,
        endLineNumber: 12,
        endColumn: 1,
      },
    ]);
  });

  it('highlights the changed words inside modified lines', () => {
    expect(changeDecorations([modified], 'original')).toEqual([
      {
        kind: 'modified',
        wholeLine: true,
        startLineNumber: 20,
        startColumn: 1,
        endLineNumber: 20,
        endColumn: 1,
      },
      {
        kind: 'modified',
        wholeLine: false,
        startLineNumber: 20,
        startColumn: 5,
        endLineNumber: 20,
        endColumn: 9,
      },
    ]);
    expect(changeDecorations([modified], 'modified')).toEqual([
      {
        kind: 'modified',
        wholeLine: true,
        startLineNumber: 19,
        startColumn: 1,
        endLineNumber: 20,
        endColumn: 1,
      },
      {
        kind: 'modified',
        wholeLine: false,
        startLineNumber: 19,
        startColumn: 5,
        endLineNumber: 19,
        endColumn: 12,
      },
      {
        kind: 'modified',
        wholeLine: false,
        startLineNumber: 20,
        startColumn: 1,
        endLineNumber: 20,
        endColumn: 30,
      },
    ]);
  });

  it('skips word ranges that are empty on that side', () => {
    const decorations = changeDecorations([modified], 'original');
    expect(decorations.some((d) => !d.wholeLine && d.startColumn === 15)).toBe(false);
  });
});
