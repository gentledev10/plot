import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalRepositoryStore, localRepositoryId } from './local-repositories';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'viewer-local-list-'));
  file = join(dir, 'local-repositories.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createLocalRepositoryStore', () => {
  it('lists the most recently opened repository first, once', async () => {
    const store = createLocalRepositoryStore(file);
    await store.add('/work/api');
    await store.add('/work/web');
    await store.add('/work/api');

    expect((await createLocalRepositoryStore(file).list()).map((item) => item.path)).toEqual([
      '/work/api',
      '/work/web',
    ]);
  });

  it('hands out stable ids and refuses unknown ones', async () => {
    const store = createLocalRepositoryStore(file);
    const { id, name } = await store.add('/work/api');

    expect(id).toBe(localRepositoryId('/work/api'));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(name).toBe('api');
    await expect(store.root(id)).resolves.toBe('/work/api');

    await store.remove(id);
    await expect(store.root(id)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('ignores entries that are not absolute paths', async () => {
    await writeFile(file, JSON.stringify([{ path: '/work/api' }, { path: 'relative' }, 'junk']));
    expect((await createLocalRepositoryStore(file).list()).map((item) => item.path)).toEqual([
      '/work/api',
    ]);
  });
});
