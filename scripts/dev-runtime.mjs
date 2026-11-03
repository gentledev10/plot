import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function buildRuntime(output, { root, electronVersion, arch }) {
  const { build, Platform, Arch } = require('electron-builder');
  const electronDist = join(dirname(require.resolve('electron/package.json')), 'dist');
  const seed = join(output, 'seed');
  await mkdir(seed, { recursive: true });
  await writeFile(
    join(seed, 'package.json'),
    JSON.stringify({
      name: 'plot-dev-runtime',
      productName: 'Plot',
      version: '0.0.0',
      main: 'index.cjs',
      description: 'Local Plot development runtime',
      author: 'Plot contributors',
    }),
  );
  await writeFile(join(seed, 'index.cjs'), '');
  await build({
    projectDir: seed,
    targets: Platform.MAC.createTarget('dir', Arch[arch]),
    publish: 'never',
    config: {
      extends: null,
      appId: 'io.github.gentledev10.plot.dev',
      productName: 'Plot',
      electronVersion,
      electronDist,
      directories: { app: seed, output, buildResources: join(root, 'build') },
      files: ['package.json', 'index.cjs'],
      asar: false,
      npmRebuild: false,
      mac: {
        identity: null,
        hardenedRuntime: false,
        notarize: false,
        icon: join(root, 'build/icon.icns'),
        // Electron detects development mode from the executable basename.
        extendInfo: { CFBundleExecutable: 'Electron' },
      },
    },
  });
  const app = join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Plot.app');
  const resources = join(app, 'Contents/Resources');
  // Restore the source-app loader instead of embedding a snapshot of Plot.
  await rm(join(resources, 'app'), { recursive: true, force: true });
  await copyFile(
    join(electronDist, 'Electron.app/Contents/Resources/default_app.asar'),
    join(resources, 'default_app.asar'),
  );
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'pipe' });
  await rm(seed, { recursive: true, force: true });
  return join(app, 'Contents/MacOS/Electron');
}

async function cachedRuntime(destination) {
  try {
    const { executable } = JSON.parse(await readFile(join(destination, 'runtime.json'), 'utf8'));
    const path = join(destination, executable);
    if ((await stat(path)).isFile()) return path;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function lockPublication(lock) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await mkdir(lock);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Never steal a lock: a paused owner could still be publishing. A crash
      // requires removing this directory after confirming no publisher remains.
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for runtime publication lock: ${lock}`);
      }
      await delay(25);
    }
  }
}

export async function prepareDevRuntime({
  root = projectRoot,
  platform = process.platform,
  arch = process.arch,
  electronVersion = require('electron/package.json').version,
  buildRuntime: build = buildRuntime,
} = {}) {
  if (platform !== 'darwin') return undefined;
  const fingerprint = createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .update(await readFile(join(root, 'build/icon.icns')))
    .update(
      JSON.stringify({
        electronVersion,
        arch,
        builder: require('electron-builder/package.json').version,
      }),
    )
    .digest('hex');
  const cache = join(root, '.dev-runtime');
  const destination = join(cache, fingerprint);
  const cached = await cachedRuntime(destination);
  if (cached) return cached;
  await mkdir(cache, { recursive: true });
  const stage = await mkdtemp(join(cache, 'prepare-'));
  try {
    console.log(
      '[plot] Preparing the named development runtime (application code is built separately).',
    );
    const executable = await build(stage, { root, electronVersion, arch });
    const relative = executable.slice(stage.length + 1);
    await writeFile(join(stage, 'runtime.json'), JSON.stringify({ executable: relative }));
    const lock = `${destination}.lock`;
    await lockPublication(lock);
    try {
      // Builds can overlap; only publication/repair must be serialized.
      const winner = await cachedRuntime(destination);
      if (winner) return winner;
      try {
        await rename(stage, destination);
      } catch (error) {
        if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
        const winner = await cachedRuntime(destination);
        if (winner) return winner;
        // Recheck under the lock before removing a broken cache, so another
        // repairer cannot delete a runtime that has just become active.
        await rm(destination, { recursive: true, force: true });
        await rename(stage, destination);
      }
      return join(destination, relative);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
