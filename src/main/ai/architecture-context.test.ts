import type { ChangedFile } from '@shared/diff';
import { describe, expect, it, vi } from 'vitest';
import { architectureContextPaths, collectArchitectureContext } from './architecture-context';

const changed = [{ path: 'apps/ui/src/app.ts' }] as ChangedFile[];
describe('architecture context', () => {
  it('stops collecting when the review is cancelled', async () => {
    const read = vi.fn(async () => ({ kind: 'text' as const, text: 'docs' }));
    const checkpoint = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error('cancelled');
      });
    await expect(
      collectArchitectureContext(['README.md', 'package.json'], changed, read, checkpoint),
    ).rejects.toThrow('cancelled');
    expect(read).toHaveBeenCalledOnce();
  });
  it('selects documentation and manifests, prioritizing roots and the changed workspace', () => {
    const paths = [
      '.env',
      'secrets.txt',
      'src/app.ts',
      '../README.md',
      '/README.md',
      'node_modules/pkg/README.md',
      'vendor/pkg/package.json',
      'README.md',
      'package.json',
      'docs/architecture/system.md',
      'apps/other/package.json',
      'apps/ui/package.json',
    ];
    expect(architectureContextPaths(paths, changed)).toEqual([
      'README.md',
      'package.json',
      'docs/architecture/system.md',
      'apps/ui/package.json',
      'apps/other/package.json',
    ]);
  });
  it('caps files and total text, recording omissions and truncation', async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `packages/p${i}/package.json`);
    const read = vi.fn(async () => ({ kind: 'text' as const, text: 'x'.repeat(15_000) }));
    const context = await collectArchitectureContext(paths, changed, read);
    expect(architectureContextPaths(paths, changed)).toHaveLength(8);
    expect(context.files.reduce((sum, file) => sum + file.text.length, 0)).toBe(32_000);
    expect(context.files.at(-1)?.truncated).toBe(true);
    expect(context.unavailable).toHaveLength(5);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledWith(expect.any(String), 16_000);
  });
  it('records unreadable, binary and oversized files without failing the review', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ kind: 'binary', size: 12 })
      .mockResolvedValueOnce({ kind: 'too-large', size: 99_000 });
    const context = await collectArchitectureContext(
      ['README.md', 'package.json', 'ARCHITECTURE.md'],
      changed,
      read,
    );
    expect(context.files).toEqual([]);
    expect(context.unavailable).toHaveLength(3);
    expect(context.scope).toContain('not a complete repository audit');
  });
});
