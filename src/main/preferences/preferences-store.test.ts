import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPreferencesStore } from './preferences-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'plot-preferences-'));
  file = join(dir, 'preferences.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createPreferencesStore', () => {
  it('keeps preferences across restarts', async () => {
    await createPreferencesStore(file).set('layout.panels', { sidebar: false, review: true });
    await expect(createPreferencesStore(file).all()).resolves.toEqual({
      'layout.panels': { sidebar: false, review: true },
    });
  });

  it('writes every change, even when many arrive at once', async () => {
    const store = createPreferencesStore(file);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.set(`key${index}`, index)));

    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(Object.keys(saved)).toHaveLength(20);
    expect(saved.key19).toBe(19);
  });

  it('starts empty when the file is missing or corrupted', async () => {
    await expect(createPreferencesStore(file).all()).resolves.toEqual({});
    await writeFile(file, '[1, 2');
    await expect(createPreferencesStore(file).all()).resolves.toEqual({});
  });
});
