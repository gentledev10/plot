import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

function setup(edge: 'left' | 'right' = 'right') {
  const props = {
    onPreview: vi.fn(),
    onResize: vi.fn(),
    onReset: vi.fn(),
  };
  render(
    <ResizeHandle
      label="Resize the sidebar"
      edge={edge}
      width={300}
      min={200}
      max={640}
      {...props}
    />,
  );
  return { ...props, handle: screen.getByRole('separator', { name: 'Resize the sidebar' }) };
}

describe('ResizeHandle', () => {
  it('follows the pointer while dragging and saves the width when released', () => {
    const { handle, onPreview, onResize } = setup();

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith(380);
    expect(onResize).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { clientX: 180, pointerId: 1 });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(380);
  });

  it('grows the other way for a panel on the right', () => {
    const { handle, onResize } = setup('left');
    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(350);
  });

  it('keeps the width within its limits', () => {
    const { handle, onResize } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 2000, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(640);
  });

  it('resizes from the keyboard and resets on Enter or a double-click', () => {
    const { handle, onResize, onReset } = setup();
    expect(handle).toHaveAttribute('aria-valuenow', '300');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(200);

    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
