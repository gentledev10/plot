import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { prepareDevRuntime, projectRoot } from '../scripts/dev-runtime.mjs';

const root = projectRoot;
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
const scratch = await mkdtemp(join(dist, 'dev-runtime-check-'));
const profile = join(scratch, 'profile');
await mkdir(profile);
await writeFile(
  join(profile, 'preferences.json'),
  JSON.stringify({ languages: { app: 'en', review: 'app' }, 'dev-runtime-fixture': 'preserved' }),
);
await writeFile(join(profile, 'appearance.json'), JSON.stringify({ source: 'dark' }));
const pass = (name) => console.log(`PASS ${name}`);
const originalPlist = join(root, 'node_modules/electron/dist/Electron.app/Contents/Info.plist');
const originalHash = createHash('sha256')
  .update(await readFile(originalPlist))
  .digest('hex');
const executable = await prepareDevRuntime();
assert.ok(executable);
const initialStat = await stat(executable);
assert.equal(await prepareDevRuntime(), executable);
assert.equal((await stat(executable)).mtimeMs, initialStat.mtimeMs);
pass('runtime cache reused without rebuilding application snapshot');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', join(executable, '../../..')]);
pass('local runtime and helpers have valid signatures');

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function until(fn, description) {
  const deadline = Date.now() + 60_000;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${description}; ${last ?? ''}\n${logs.slice(-4000)}`);
}
const inspectorPort = await freePort();
const rendererPort = await freePort();
let logs = '';
const child = spawn(
  'npm',
  [
    'run',
    'dev',
    '--',
    `--inspect=${inspectorPort}`,
    `--remoteDebuggingPort=${rendererPort}`,
    '--',
    `--user-data-dir=${profile}`,
    '--use-mock-keychain',
  ],
  {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  },
);
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (data) => {
    logs += data;
  });
const mainPath = join(root, 'src/main/index.ts');
const rendererPath = join(root, 'src/renderer/src/main.tsx');
const originalMain = await readFile(mainPath, 'utf8');
const originalRenderer = await readFile(rendererPath, 'utf8');
let browser;
async function evaluateMain(expression) {
  const response = await fetch(`http://127.0.0.1:${inspectorPort}/json/list`);
  const [target] = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  try {
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('inspector evaluation timeout')), 5000);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.error || message.result.exceptionDetails)
          reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      };
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
    return await reply;
  } finally {
    socket.close();
  }
}
try {
  await until(() => logs.includes('starting electron app'), 'npm run dev startup');
  await until(
    async () => (await fetch(`http://127.0.0.1:${rendererPort}/json/version`)).ok,
    'renderer debugger',
  );
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${rendererPort}`);
  const page = await until(
    () =>
      browser
        .contexts()[0]
        ?.pages()
        .find((p) => p.url().startsWith('http://localhost:')),
    'development page',
  );
  await page.waitForLoadState('domcontentloaded');
  await until(() => page.title().then((title) => title === 'Plot'), 'Plot title');
  const state = await evaluateMain(
    `(() => { const {app,Menu,nativeTheme}=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');return {pid:process.pid,name:app.name,isPackaged:app.isPackaged,defaultApp:process.defaultApp,userData:app.getPath('userData'),appPath:app.getAppPath(),menu:Menu.getApplicationMenu().items[0].label,theme:nativeTheme.themeSource};})()`,
  );
  assert.equal(state.name, 'Plot');
  assert.equal(state.menu, 'Plot');
  assert.equal(state.isPackaged, false);
  assert.equal(state.defaultApp, true);
  assert.equal(await realpath(state.userData), await realpath(profile));
  assert.equal(state.appPath, root);
  const preferences = await page.evaluate(() => window.plot.getPreferences());
  assert.equal(preferences.ok, true);
  assert.equal(preferences.value['dev-runtime-fixture'], 'preserved');
  pass(
    'npm run dev uses current source, development server, Plot menu and existing profile preferences',
  );

  const namedApp = execFileSync(
    '/usr/bin/osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit'); ObjC.unwrap($.NSRunningApplication.runningApplicationWithProcessIdentifier(${state.pid}).localizedName)`,
    ],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(namedApp, 'Plot');
  pass('macOS reports the running application name as Plot');
  const marker = `hmr-${Date.now()}`;
  await writeFile(
    rendererPath,
    `${originalRenderer}\ndocument.documentElement.dataset.plotDevCheck = ${JSON.stringify(marker)};\n`,
  );
  await page.waitForFunction(
    (value) => document.documentElement.dataset.plotDevCheck === value,
    marker,
  );
  pass('renderer source edit updates the running window');
  await writeFile(rendererPath, originalRenderer);
  const devUrl = page.url();
  await browser.close();
  browser = undefined;
  await evaluateMain(`setTimeout(() => process.getBuiltinModule('inspector').close(), 100); true`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const restartMarker = `plot-main-restart-${Date.now()}`;
  await writeFile(
    mainPath,
    `${originalMain}\nconsole.log(${JSON.stringify(`${restartMarker}:`)} + process.pid);\n`,
  );
  const restartedPid = await until(() => {
    const match = logs.match(new RegExp(`${restartMarker}:(\\d+)`));
    return match && Number(match[1]);
  }, 'main process rebuild/restart with new source');
  assert.notEqual(restartedPid, state.pid);
  pass('main source edit rebuilds and restarts the app');
  assert.equal((await stat(executable)).mtimeMs, initialStat.mtimeMs);
  pass('source edits do not rebuild or replace the Electron runtime');
  assert.equal(
    createHash('sha256')
      .update(await readFile(originalPlist))
      .digest('hex'),
    originalHash,
  );
  pass('installed original Electron bundle remains unchanged');
  await writeFile(
    join(dist, 'dev-runtime-report.json'),
    JSON.stringify({ state, namedApp, url: devUrl, restartedPid, executable }, null, 2),
  );
} finally {
  await writeFile(mainPath, originalMain);
  await writeFile(rendererPath, originalRenderer);
  await browser?.close().catch(() => {});
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  await writeFile(join(dist, 'dev-runtime-check.log'), logs);
}
