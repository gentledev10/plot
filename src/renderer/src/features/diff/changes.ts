export interface CharChange {
  originalStartLineNumber: number;
  originalStartColumn: number;
  originalEndLineNumber: number;
  originalEndColumn: number;
  modifiedStartLineNumber: number;
  modifiedStartColumn: number;
  modifiedEndLineNumber: number;
  modifiedEndColumn: number;
}

export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
  charChanges?: CharChange[];
}

export type ChangeKind = 'inserted' | 'deleted' | 'modified';

export type Side = 'original' | 'modified';

export type Direction = 'next' | 'previous';

export interface ChangeDecoration {
  kind: ChangeKind;
  wholeLine: boolean;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export function changeKind(change: LineChange): ChangeKind {
  if (change.originalEndLineNumber === 0) {
    return 'inserted';
  }
  if (change.modifiedEndLineNumber === 0) {
    return 'deleted';
  }
  return 'modified';
}

export function anchorLine(change: LineChange): number {
  return Math.max(1, change.modifiedStartLineNumber);
}

export function findAdjacentChange(
  changes: readonly LineChange[],
  line: number,
  direction: Direction,
): number | undefined {
  if (direction === 'next') {
    const index = changes.findIndex((change) => anchorLine(change) > line);
    return index === -1 ? undefined : index;
  }
  for (let index = changes.length - 1; index >= 0; index--) {
    const change = changes[index];
    if (change && anchorLine(change) < line) {
      return index;
    }
  }
  return undefined;
}

export function changeDecorations(changes: readonly LineChange[], side: Side): ChangeDecoration[] {
  const decorations: ChangeDecoration[] = [];
  for (const change of changes) {
    const kind = changeKind(change);
    const start =
      side === 'original' ? change.originalStartLineNumber : change.modifiedStartLineNumber;
    const end = side === 'original' ? change.originalEndLineNumber : change.modifiedEndLineNumber;
    if (end === 0) {
      continue;
    }
    decorations.push({
      kind,
      wholeLine: true,
      startLineNumber: start,
      startColumn: 1,
      endLineNumber: end,
      endColumn: 1,
    });
    if (kind === 'modified') {
      decorations.push(...wordDecorations(change.charChanges ?? [], side));
    }
  }
  return decorations;
}

function wordDecorations(charChanges: readonly CharChange[], side: Side): ChangeDecoration[] {
  return charChanges.flatMap((char) => {
    const range =
      side === 'original'
        ? [
            char.originalStartLineNumber,
            char.originalStartColumn,
            char.originalEndLineNumber,
            char.originalEndColumn,
          ]
        : [
            char.modifiedStartLineNumber,
            char.modifiedStartColumn,
            char.modifiedEndLineNumber,
            char.modifiedEndColumn,
          ];
    const [startLineNumber = 0, startColumn = 0, endLineNumber = 0, endColumn = 0] = range;
    const isEmpty =
      endLineNumber === 0 || (startLineNumber === endLineNumber && startColumn === endColumn);
    return isEmpty
      ? []
      : [
          {
            kind: 'modified' as const,
            wholeLine: false,
            startLineNumber,
            startColumn,
            endLineNumber,
            endColumn,
          },
        ];
  });
}
