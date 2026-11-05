import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { VectorDiagram } from './VectorDiagram';

const graph = {
  nodes: [
    {
      id: 'retry',
      label: 'Retry policy',
      role: 'component' as const,
      status: 'added' as const,
      evidence: 'code' as const,
      location: { path: 'src/retry.ts', line: 4 },
    },
  ],
  edges: [],
};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('change map nodes', () => {
  it('omits decorative side stripes while retaining status and code navigation', async () => {
    const onOpen = vi.fn();
    const { container } = renderWithApi(
      <VectorDiagram
        graph={graph}
        label="Change map"
        changedPaths={new Set(['src/retry.ts'])}
        onOpen={onOpen}
      />,
    );
    const node = await screen.findByRole('button', { name: 'Retry policy' });
    expect(container.querySelector('rect[width="3"]')).toBeNull();
    expect(node).toHaveAttribute('data-status', 'added');
    expect(node.querySelector('title')).toHaveTextContent('Retry policy');
    await userEvent.click(node);
    expect(onOpen).toHaveBeenCalledWith({ path: 'src/retry.ts', line: 4 });
  });
});
