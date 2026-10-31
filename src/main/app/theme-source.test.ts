import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readThemeSource, writeThemeSource } from './theme-source';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'viewer-theme-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('theme source', () => {
  it('follows macOS until something else is saved', async () => {
    const file = join(dir, 'appearance.json');
    await expect(readThemeSource(file)).resolves.toBe('system');
    await writeThemeSource(file, 'dark');
    await expect(readThemeSource(file)).resolves.toBe('dark');
  });

  it('falls back to following macOS for anything it does not recognize', async () => {
    const file = join(dir, 'appearance.json');
    await writeFile(file, JSON.stringify({ source: 'purple' }));
    await expect(readThemeSource(file)).resolves.toBe('system');
    await writeFile(file, '{oops');
    await expect(readThemeSource(file)).resolves.toBe('system');
  });
});
