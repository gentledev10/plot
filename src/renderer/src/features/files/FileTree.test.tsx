import type { ChangedFile } from '@shared/diff';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileTree } from './FileTree';
import { buildFileTree } from './file-tree';

function changed(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path,
    status: 'modified',
    kind: 'file',
    oldBlob: 'a'.repeat(40),
    newBlob: 'b'.repeat(40),
    additions: 3,
    deletions: 1,
    ...overrides,
  };
}

const files = [
  changed('src/app.ts'),
  changed('src/lib/util.ts', { status: 'added', deletions: 0 }),
  changed('README.md', { status: 'deleted', additions: 0 }),
];

function Harness({ onSelect }: { onSelect(path: string): void }) {
  const [selected, setSelected] = useState<string>('src/lib/util.ts');
  return (
    <FileTree
      nodes={buildFileTree(files)}
      selectedPath={selected}
      onSelect={(path) => {
        setSelected(path);
        onSelect(path);
      }}
    />
  );
}

const item = (name: RegExp | string) => screen.getByRole('treeitem', { name });

describe('FileTree', () => {
  it('shows directories, files, and line counts', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(screen.getByRole('tree', { name: 'Changed files' })).toBeInTheDocument();
    expect(item(/^src$/)).toHaveAttribute('aria-expanded', 'true');
    expect(item(/app\.ts/)).toHaveTextContent('+3−1');
    expect(item(/util\.ts/)).toHaveTextContent('+3');
    expect(item(/README\.md/)).toHaveTextContent('−1');
    expect(item(/util\.ts/)).toHaveAttribute('aria-selected', 'true');
  });

  it('marks binary files instead of showing counts', () => {
    render(
      <FileTree
        nodes={buildFileTree([changed('logo.png', { additions: null, deletions: null })])}
        onSelect={vi.fn()}
      />,
    );
    expect(item(/logo\.png/)).toHaveTextContent('binary');
  });

  it('opens a file when it is clicked', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.click(item(/README\.md/));
    expect(onSelect).toHaveBeenCalledWith('README.md');
  });

  it('collapses and expands directories', async () => {
    render(<Harness onSelect={vi.fn()} />);
    await userEvent.click(item(/^src$/));
    expect(item(/^src$/)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: /app\.ts/ })).not.toBeInTheDocument();

    await userEvent.click(item(/^src$/));
    expect(screen.getByRole('treeitem', { name: /app\.ts/ })).toBeInTheDocument();
  });

  it('keeps only one row in the tab order', () => {
    render(<Harness onSelect={vi.fn()} />);
    const focusable = screen.getAllByRole('treeitem').filter((row) => row.tabIndex === 0);
    expect(focusable).toEqual([item(/util\.ts/)]);
  });

  it('moves with the arrow keys and opens files as it goes', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    item(/util\.ts/).focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(item(/app\.ts/)).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('src/app.ts');

    await userEvent.keyboard('{ArrowDown}');
    expect(item(/README\.md/)).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(item(/^src$/)).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(item(/README\.md/)).toHaveFocus();
  });

  it('collapses with ArrowLeft, climbs to the parent, and expands with ArrowRight', async () => {
    render(<Harness onSelect={vi.fn()} />);
    item(/util\.ts/).focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(item(/^lib$/)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item(/^lib$/)).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('{ArrowRight}');
    expect(item(/^lib$/)).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(item(/util\.ts/)).toHaveFocus();
  });
});
