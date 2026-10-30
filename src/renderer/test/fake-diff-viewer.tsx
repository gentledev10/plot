import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import type { Direction } from '../src/features/diff/changes';
import type {
  ChangePosition,
  DiffSettings,
  DiffViewerHandle,
} from '../src/features/diff/DiffViewer';

const changeCounts = new Map<string, number>();

export function setFakeChangeCount(path: string, count: number) {
  changeCounts.set(path, count);
}

export function resetFakeDiffViewer() {
  changeCounts.clear();
}

interface FakeDiffViewerProps {
  path: string;
  original: string;
  modified: string;
  settings: DiffSettings;
  initialChange?: 'first' | 'last';
  onChangesComputed?(total: number): void;
  onReveal?(position: ChangePosition): void;
  ref?: Ref<DiffViewerHandle>;
}

export function DiffViewer({
  path,
  original,
  modified,
  initialChange,
  onChangesComputed,
  onReveal,
  ref,
}: FakeDiffViewerProps) {
  const total = changeCounts.get(path) ?? 1;
  const index = useRef<number | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mounted file, like a real diff computation
  useEffect(() => {
    onChangesComputed?.(total);
    if (initialChange && total > 0) {
      index.current = initialChange === 'first' ? 0 : total - 1;
      onReveal?.({ index: index.current, total });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    goToChange(direction: Direction) {
      const current = index.current ?? -1;
      const next = direction === 'next' ? current + 1 : current - 1;
      if (next < 0 || next >= total) {
        return undefined;
      }
      index.current = next;
      return { index: next, total };
    },
  }));

  return (
    <div data-testid="diff-viewer" data-path={path}>
      <pre data-testid="original">{original}</pre>
      <pre data-testid="modified">{modified}</pre>
    </div>
  );
}
