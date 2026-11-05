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
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'plot-readability-')));
const profile = join(scratch, 'profile');
const repository = join(scratch, 'notification-service');
const output = join(root, 'dist', 'review-readability');
for (const dir of [profile, repository, output]) mkdirSync(dir, { recursive: true });
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
const review = {
  ...overview,
  summary: `${overview.summary}\n\n- **Bounded retries** keep temporary failures recoverable.\n- A stable event ID protects delivery identity.`,
  units: [
    {
      id: 'retry',
      title: 'Retry temporary failures',
      summary: overview.summary,
      rationale: 'Recover temporary provider failures without changing delivery identity.',
      rationaleEvidence: 'description',
      files: ['deliver.ts', 'retry.ts', 'retry.test.ts'].map((file) => ({
        path: `src/notifications/${file}`,
        role: file.includes('.test.') ? 'test' : 'implementation',
        reason: 'Implements or checks retry behavior.',
        ranges: [],
        beforeRanges: [],
      })),
      changeTitles: overview.changes.map((change) => change.title),
      visualTitles: overview.visuals.map((visual) => visual.title),
      simulationIds: [],
      reviewPointTitles: overview.reviewPoints.map((point) => point.title),
    },
  ],
};
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
    review,
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
let app;
let page;
const errors = [];
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
  page.on('pageerror', (error) => errors.push(error.message));
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
  await settings.waitFor({ state: 'hidden' });
  await page;
  await page
    .getByRole('button', { name: /Retry notifications without/ })
    .first()
    .click();
  const panel = page.getByRole('complementary', { name: 'AI overview' });
  const scope = panel.getByRole('combobox', { name: 'Scope', exact: true });
  await scope.waitFor();
  await page.waitForFunction(() => document.querySelector('select') !== null);
  await scope.selectOption('all');
  await panel.getByRole('heading', { name: 'At a glance', exact: true }).waitFor();
  assert.equal(await scope.inputValue(), 'all');
  await panel.locator('[data-step-id="summary"] ul li').first().waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('idempotencyKey'),
  );
  await page.screenshot({ path: join(output, 'overview.png'), scale: 'css' });
  await scope.selectOption('unit:retry');
  await panel.getByRole('heading', { name: 'Retry temporary failures', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('combobox', { name: 'Read by change', exact: false }).inputValue(),
    'unit:retry',
  );
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  assert.equal(await question.evaluate((field) => field.closest('details') === null), true);
  await question.fill('What happens if the provider keeps returning 503?');
  await question.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'question.png'), scale: 'css' });
  const visual = panel.locator('[data-step-id="architecture"]');
  await scope.selectOption('all');
  await visual.getByRole('button', { name: 'Enlarge diagrams', exact: true }).click();
  await page.getByRole('button', { name: 'Side by side', exact: true }).click();
  const map = page.getByRole('img', {
    name: 'A retry boundary around delivery · After',
    exact: true,
  });
  await map.getByRole('button').filter({ hasText: 'Retry policy' }).waitFor();
  assert.equal(await map.locator('rect[width="3"]').count(), 0);
  await page.screenshot({ path: join(output, 'map.png'), scale: 'css' });
  await visual.locator('h3 button').click();
  await panel.locator('[data-step-id="readingOrder"] h3 button').click();
  await scope.evaluate((field) => field.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(output, 'reading.png'), scale: 'css' });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          'structured summary',
          'persistent two-way scope',
          'always-visible question composer',
          'map without decorative stripes',
          'no renderer errors',
        ],
        screenshots: ['overview.png', 'question.png', 'map.png'].map((name) => join(output, name)),
      },
      null,
      2,
    ),
  );
} finally {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
}
