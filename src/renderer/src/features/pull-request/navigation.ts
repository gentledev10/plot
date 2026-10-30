import type { ChangedFile } from '@shared/diff';
import type { Direction } from '../diff/changes';
import type { ChangePosition } from '../diff/DiffViewer';

export type NavigationOutcome =
  | { kind: 'moved'; position: ChangePosition }
  | { kind: 'armed'; direction: Direction; file: ChangedFile }
  | { kind: 'open-file'; file: ChangedFile; at: 'first' | 'last' }
  | { kind: 'boundary'; direction: Direction };

interface NavigationInput {
  direction: Direction;
  moved: ChangePosition | undefined;
  armed: Direction | undefined;
  neighbor: ChangedFile | undefined;
}

export function decideNavigation({
  direction,
  moved,
  armed,
  neighbor,
}: NavigationInput): NavigationOutcome {
  if (moved) {
    return { kind: 'moved', position: moved };
  }
  if (!neighbor) {
    return { kind: 'boundary', direction };
  }
  if (armed === direction) {
    return { kind: 'open-file', file: neighbor, at: direction === 'next' ? 'first' : 'last' };
  }
  return { kind: 'armed', direction, file: neighbor };
}

export function adjacentFile(
  files: readonly ChangedFile[],
  path: string | undefined,
  direction: Direction,
): ChangedFile | undefined {
  const index = files.findIndex((file) => file.path === path);
  if (index === -1) {
    return undefined;
  }
  return files[direction === 'next' ? index + 1 : index - 1];
}
