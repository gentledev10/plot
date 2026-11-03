import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('prepares a named runtime once, independent of application source changes', async () => {
  const { prepareDevRuntime } = await import('./dev-runtime.mjs');
  const root = mkdtempSync(join(tmpdir(), 'plot-dev-runtime-'));
  roots.push(root);
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, 'build/icon.icns'), 'icon-v1');
  const buildRuntime = vi.fn(async (output: string) => {
    const executable = join(output, 'Plot.app/Contents/MacOS/Plot');
    mkdirSync(join(output, 'Plot.app/Contents/MacOS'), { recursive: true });
    writeFileSync(executable, 'runtime');
    return executable;
  });
  const options = {
    root,
    platform: 'darwin',
    arch: 'arm64',
    electronVersion: '45.0.0',
    buildRuntime,
  };
  const first = await prepareDevRuntime(options);
  assert(first);
  expect(first).toContain('Plot.app/Contents/MacOS/Plot');
  expect(readFileSync(first, 'utf8')).toBe('runtime');
  writeFileSync(join(root, 'source.ts'), 'changed application source');
  expect(await prepareDevRuntime(options)).toBe(first);
  expect(buildRuntime).toHaveBeenCalledTimes(1);

  writeFileSync(join(root, 'build/icon.icns'), 'icon-v2');
  expect(await prepareDevRuntime(options)).not.toBe(first);
  expect(buildRuntime).toHaveBeenCalledTimes(2);
  await prepareDevRuntime({ ...options, electronVersion: '46.0.0' });
  expect(buildRuntime).toHaveBeenCalledTimes(3);
  const current = await prepareDevRuntime({ ...options, electronVersion: '46.0.0' });
  assert(current);
  rmSync(current);
  await prepareDevRuntime({ ...options, electronVersion: '46.0.0' });
  expect(buildRuntime).toHaveBeenCalledTimes(4);
});

it.each(['cold', 'missing executable'])(
  'preserves the first concurrent publisher (%s cache)',
  async (state) => {
    const { prepareDevRuntime } = await import('./dev-runtime.mjs');
    const root = mkdtempSync(join(tmpdir(), 'plot-dev-runtime-'));
    roots.push(root);
    mkdirSync(join(root, 'build'), { recursive: true });
    writeFileSync(join(root, 'build/icon.icns'), 'icon');
    const writeRuntime = (output: string) => {
      const executable = join(output, 'Plot.app/Contents/MacOS/Plot');
      mkdirSync(join(output, 'Plot.app/Contents/MacOS'), { recursive: true });
      writeFileSync(executable, 'runtime');
      return executable;
    };
    const options = {
      root,
      platform: 'darwin',
      buildRuntime: async (output: string) => writeRuntime(output),
    };
    if (state === 'missing executable') {
      const executable = await prepareDevRuntime(options);
      assert(executable);
      rmSync(executable);
    }
    let startSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => {
      startSecond = resolve;
    });
    let firstPublished!: () => void;
    const published = new Promise<void>((resolve) => {
      firstPublished = resolve;
    });
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const buildRuntime = vi.fn(async (output: string) => {
      if (buildRuntime.mock.calls.length === 1) {
        firstStarted();
        await secondStarted;
      } else {
        startSecond();
        await published;
      }
      return writeRuntime(output);
    });
    // Both builders must see the cold/broken cache before either publishes.
    const first = prepareDevRuntime({ ...options, buildRuntime });
    await started;
    const second = prepareDevRuntime({ ...options, buildRuntime });
    try {
      const winner = await first;
      assert(winner);
      writeFileSync(join(winner, '..', 'active-runtime'), 'must survive');
      firstPublished();
      expect(await second).toBe(winner);
      expect(readFileSync(join(winner, '..', 'active-runtime'), 'utf8')).toBe('must survive');
    } finally {
      firstPublished();
      startSecond();
      await Promise.allSettled([first, second]);
    }
  },
);

it('times out without stealing a publication lock and can retry after its removal', async () => {
  const { prepareDevRuntime } = await import('./dev-runtime.mjs');
  const root = mkdtempSync(join(tmpdir(), 'plot-dev-runtime-'));
  roots.push(root);
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, 'build/icon.icns'), 'icon');
  const buildRuntime = async (output: string) => {
    const executable = join(output, 'runtime');
    writeFileSync(executable, 'runtime');
    return executable;
  };
  const options = { root, platform: 'darwin', buildRuntime };
  const executable = await prepareDevRuntime(options);
  assert(executable);
  rmSync(executable);
  const lock = `${dirname(executable)}.lock`;
  mkdirSync(lock);
  let now = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 20_000));
  try {
    await expect(prepareDevRuntime(options)).rejects.toThrow(
      `Timed out waiting for runtime publication lock: ${lock}`,
    );
    expect(existsSync(lock)).toBe(true);
  } finally {
    clock.mockRestore();
    rmSync(lock, { recursive: true });
  }
  expect(await prepareDevRuntime(options)).toBe(executable);
  expect(existsSync(lock)).toBe(false);
});

it('does not prepare a macOS bundle on other platforms', async () => {
  const { prepareDevRuntime } = await import('./dev-runtime.mjs');
  const buildRuntime = vi.fn();
  expect(await prepareDevRuntime({ platform: 'linux', buildRuntime })).toBeUndefined();
  expect(buildRuntime).not.toHaveBeenCalled();
});

it('propagates preparation failures and retries rather than caching a broken runtime', async () => {
  const { prepareDevRuntime } = await import('./dev-runtime.mjs');
  const root = mkdtempSync(join(tmpdir(), 'plot-dev-runtime-'));
  roots.push(root);
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, 'build/icon.icns'), 'icon');
  const buildRuntime = vi.fn(async () => {
    throw new Error('signing failed');
  });
  const options = { root, platform: 'darwin', buildRuntime };
  await expect(prepareDevRuntime(options)).rejects.toThrow('signing failed');
  await expect(prepareDevRuntime(options)).rejects.toThrow('signing failed');
  expect(buildRuntime).toHaveBeenCalledTimes(2);
});
