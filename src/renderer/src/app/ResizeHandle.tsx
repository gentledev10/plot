import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { useT } from '../features/language/LanguageProvider';
import styles from './ResizeHandle.module.css';

const KEYBOARD_STEP = 16;
interface ResizeHandleProps {
  label: string;
  edge: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onPreview(width: number): void;
  onResize(width: number): void;
  onReset(): void;
}
export function ResizeHandle({
  label,
  edge,
  width,
  min,
  max,
  onPreview,
  onResize,
  onReset,
}: ResizeHandleProps) {
  const t = useT();
  const drag = useRef<
    | {
        x: number;
        width: number;
        last: number;
      }
    | undefined
  >(undefined);
  const [dragging, setDragging] = useState(false);
  const grow = edge === 'right' ? 1 : -1;
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      x: event.clientX,
      width,
      last: width,
    };
    setDragging(true);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) {
      return;
    }
    current.last = clamp(current.width + (event.clientX - current.x) * grow);
    onPreview(current.last);
  }
  function onPointerUp() {
    const current = drag.current;
    drag.current = undefined;
    setDragging(false);
    if (current && current.last !== current.width) {
      onResize(current.last);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowLeft: -KEYBOARD_STEP * grow,
      ArrowRight: KEYBOARD_STEP * grow,
    };
    if (event.key in steps) {
      event.preventDefault();
      onResize(clamp(width + (steps[event.key] ?? 0)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onResize(event.key === 'Home' ? min : max);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onReset();
    }
  }
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a resizable splitter; <hr> cannot take focus */}
      <div
        role="separator"
        tabIndex={0}
        className={styles.handle}
        data-edge={edge}
        data-dragging={dragging}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        title={t('{value0}. Double-click to reset.', {
          value0: label,
        })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onReset}
        onKeyDown={onKeyDown}
      />
      {dragging && <div className={styles.shield} />}
    </>
  );
}
