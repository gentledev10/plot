import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import { after, before, overview } from './demo-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'plot-demo-')));
const profile = join(scratch, 'profile');
const repository = join(scratch, 'notification-service');
const output = join(root, 'docs', 'media');
const frames = join(scratch, 'frames');
for (const dir of [profile, repository, output, frames]) mkdirSync(dir, { recursive: true });
const git = (...args) =>
  execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
function files(values) {
  for (const [path, text] of Object.entries(values)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), text);
  }
}
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Plot Demo');
git('config', 'user.email', 'demo@example.com');
files(before);
git('add', '.');
git('commit', '-qm', 'Deliver notifications');
const base = git('rev-parse', 'HEAD');
git('switch', '-qc', 'reliable-delivery');
files(after);
git('add', '.');
git('commit', '-qm', 'Retry notifications with a stable delivery identity');
const head = git('rev-parse', 'HEAD');
const stats = git('diff', '--numstat', base, head)
  .split('\n')
  .map((line) => line.split('\t'));
const additions = stats.reduce((sum, row) => sum + Number(row[0]), 0);
const deletions = stats.reduce((sum, row) => sum + Number(row[1]), 0);
writeFileSync(
  join(profile, 'preferences.json'),
  JSON.stringify({
    languages: { app: 'en', review: 'en' },
    appearance: { theme: 'dark', codeFont: { family: 'JetBrains Mono', size: 12 }, colors: {} },
    'layout.sizes': { sidebar: 220, review: 440 },
  }),
);
const reviewPath = join(
  profile,
  `reviews/github.com/plot-demo/notification-service/42-${head}-en.json`,
);
mkdirSync(dirname(reviewPath), { recursive: true });
writeFileSync(
  reviewPath,
  JSON.stringify({
    format: 2,
    language: 'en',
    head,
    createdAt: new Date().toISOString(),
    review: overview,
  }),
);
const cache = join(profile, 'repositories/github.com/plot-demo/notification-service.git');
mkdirSync(dirname(cache), { recursive: true });
execFileSync('git', ['clone', '--bare', '-q', repository, cache]);
// Leave an uncommitted change for the separate local-work capture.
writeFileSync(
  join(repository, 'src/notifications/retry.ts'),
  after['src/notifications/retry.ts']
    .replace('MAX_ATTEMPTS = 3', 'MAX_ATTEMPTS = 4')
    .replace('BASE_DELAY_MS = 500', 'BASE_DELAY_MS = 250'),
);
const captureFrames = [];
let app;
let page;
let recording = false;
try {
  app = await _electron.launch({
    executablePath: createRequire(import.meta.url)('electron'),
    args: [`--user-data-dir=${profile}`, root],
  });
  await app.evaluate(
    ({ BrowserWindow, dialog, net, shell }, data) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1120 });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [data.repository] });
      shell.openExternal = async () => {};
      const originalFetch = net.fetch.bind(net);
      net.fetch = async (url) => {
        const address = new URL(url);
        if (address.protocol === 'file:') return originalFetch(url);
        if (address.hostname !== 'api.github.com') return new Response('', { status: 404 });
        const user = { login: 'plot-demo', avatar_url: '' };
        const pull = {
          number: 42,
          title: 'Retry notifications without duplicate deliveries',
          body: 'Retry temporary HTTP failures with backoff and a stable event identity.',
          html_url: 'https://github.com/plot-demo/notification-service/pull/42',
          updated_at: new Date().toISOString(),
          node_id: 'PR_demo42',
          state: 'open',
          draft: false,
          merged: false,
          merged_at: null,
          user,
          base: {
            ref: 'main',
            sha: data.base,
            repo: { name: 'notification-service', owner: { login: 'plot-demo' } },
          },
          head: { ref: 'reliable-delivery', sha: data.head },
          additions: data.additions,
          deletions: data.deletions,
          changed_files: 3,
        };
        let value;
        if (address.pathname === '/user') value = user;
        else if (address.pathname === '/search/issues')
          value = {
            total_count: 1,
            items: [
              {
                ...pull,
                repository_url: 'https://api.github.com/repos/plot-demo/notification-service',
                pull_request: {
                  url: 'https://api.github.com/repos/plot-demo/notification-service/pulls/42',
                  merged_at: null,
                },
              },
            ],
          };
        else if (address.pathname.endsWith('/pulls/42')) value = pull;
        else if (address.pathname.includes('/compare/'))
          value = { merge_base_commit: { sha: data.base } };
        else if (address.pathname === '/user/repos') value = [];
        else return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
    },
    { repository, base, head, additions, deletions },
  );
  page = await app.firstWindow();
  page.on('pageerror', (error) => console.error('Renderer error:', error.stack));
  page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: 'Open changes', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: false }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Accounts', exact: true }).click();
  await settings.getByRole('button', { name: 'Use a personal access token', exact: false }).click();
  await settings
    .getByLabel('Personal access token', { exact: true })
    .fill('illustrative-demo-token-not-a-credential');
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  await settings.getByText('plot-demo', { exact: true }).first().waitFor();
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page
    .getByRole('button', { name: /Retry notifications without/ })
    .first()
    .waitFor();
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    if (recording) {
      const path = join(frames, `${String(captureFrames.length).padStart(5, '0')}.jpg`);
      writeFileSync(path, Buffer.from(data, 'base64'));
      captureFrames.push({ path, time: metadata.timestamp });
    }
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function moveClick(locator) {
    const box = await locator.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await pause(400);
    await locator.click();
  }
  recording = true;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: 1600,
    maxHeight: 1120,
  });
  await pause(1800);
  await moveClick(page.getByRole('button', { name: /Retry notifications without/ }).first());
  await page.getByRole('treeitem').filter({ hasText: 'deliver.ts' }).click();
  await page.getByText(overview.summary, { exact: true }).waitFor();
  await page.locator('[data-step-id="architecture"] svg').first().waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('idempotencyKey'),
  );
  await pause(2000);
  await page.screenshot({ path: join(output, 'pull-request.png'), scale: 'css' });
  await pause(2500);
  await moveClick(page.getByRole('treeitem').filter({ hasText: 'retry.ts', hasNotText: 'test' }));
  await pause(3000);
  await page.keyboard.press('F7');
  await pause(2000);
  const map = page.locator('[data-step-id="architecture"]');
  await moveClick(map.getByRole('button', { name: 'Enlarge diagrams', exact: true }));
  await pause(2000);
  await moveClick(page.getByRole('button', { name: 'Side by side', exact: true }));
  await pause(2500);
  await page.screenshot({ path: join(output, 'change-map.png'), scale: 'css' });
  await pause(2500);
  await moveClick(
    page
      .getByRole('img', { name: 'A retry boundary around delivery · After', exact: true })
      .getByRole('button')
      .filter({ hasText: 'Retry policy' }),
  );
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('MAX_ATTEMPTS'),
  );
  await pause(1000);
  await page.keyboard.press('Meta+0');
  await pause(1000);
  await moveClick(page.getByRole('button', { name: 'Choose a folder…', exact: true }));
  await page.getByRole('treeitem').filter({ hasText: 'retry.ts', hasNotText: 'test' }).click();
  await moveClick(page.getByRole('radio', { name: 'Uncommitted only', exact: true }));
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('BASE_DELAY_MS'),
  );
  await pause(2000);
  await page.screenshot({ path: join(output, 'local-changes.png'), scale: 'css' });
  await pause(2500);
  recording = false;
  await cdp.send('Page.stopScreencast');
  assert.ok(captureFrames.length > 10);
  const concat = captureFrames
    .map(
      (frame, i) =>
        `file '${frame.path}'\nduration ${i + 1 < captureFrames.length ? Math.max(0.01, captureFrames[i + 1].time - frame.time) : 2}`,
    )
    .join('\n');
  writeFileSync(join(scratch, 'frames.txt'), `${concat}\nfile '${captureFrames.at(-1).path}'\n`);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    join(scratch, 'frames.txt'),
    '-vf',
    'fps=24,scale=1600:1120',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(output, 'plot-demo.mp4'),
  ]);
  console.log('Captured three English screenshots and a real-app demo in docs/media.');
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: join(root, 'dist/demo-capture-failure.png'), scale: 'css' })
      .catch(() => {});
    console.error((await page.locator('body').textContent()).slice(0, 7000));
  }
  throw error;
} finally {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
}
