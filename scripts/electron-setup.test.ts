import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function runLifecycle(lifecycle: string, failInstall = false) {
  const cwd = mkdtempSync(join(tmpdir(), 'plot-electron-setup-'));
  fixtures.push(cwd);
  mkdirSync(join(cwd, 'node_modules/.bin'), { recursive: true });
  const installer = join(cwd, 'node_modules/.bin/install-electron');
  writeFileSync(
    installer,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.env.PLOT_TEST_FAIL_INSTALL === '1') process.exit(42);
fs.writeFileSync('electron-ready', 'installed');
`,
  );
  chmodSync(installer, 0o755);
  writeFileSync(
    join(cwd, 'launch.cjs'),
    "require('node:fs').accessSync('electron-ready'); console.log('Electron ready before launch');",
  );
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'plot-electron-setup-test',
      private: true,
      scripts: { ...scripts, dev: 'node launch.cjs', preview: 'node launch.cjs' },
    }),
  );
  const result = spawnSync('npm', ['run', lifecycle], {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      npm_config_ignore_scripts: 'false',
      PLOT_TEST_FAIL_INSTALL: failInstall ? '1' : '0',
    },
  });
  return { ...result, cwd };
}

describe('Electron binary setup lifecycle', () => {
  it('uses the installer supplied by the locally installed Electron package', () => {
    expect(scripts['setup:electron']).toBe('install-electron');
  });

  it('installs the binary after dependency installation', () => {
    const result = runLifecycle('postinstall');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(join(result.cwd, 'electron-ready'), 'utf8')).toBe('installed');
  });

  for (const lifecycle of ['dev', 'preview']) {
    it(`ensures the binary exists before ${lifecycle}`, () => {
      const result = runLifecycle(lifecycle);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain('Electron ready before launch');
    });

    it(`does not launch ${lifecycle} when binary installation fails`, () => {
      const result = runLifecycle(lifecycle, true);
      expect(result.status, result.stdout + result.stderr).toBe(42);
      expect(result.stdout).not.toContain('Electron ready before launch');
    });
  }
});
