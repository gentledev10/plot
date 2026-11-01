import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'plot-smoke-')));
const profile = join(scratch, 'profile');
const repository = join(scratch, 'fixture');
const bin = join(scratch, 'bin');
const results = [];
const pass = (name) => {
  results.push(name);
  console.log(`PASS ${name}`);
};
for (const path of [profile, repository, bin]) mkdirSync(path, { recursive: true });
const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
git(repository, 'init', '-q', '-b', 'main');
git(repository, 'config', 'user.name', 'Fixture');
git(repository, 'config', 'user.email', 'fixture@example.com');
writeFileSync(join(repository, 'sample.ts'), 'export const result = 1;\n');
git(repository, 'add', '.');
git(repository, 'commit', '-qm', 'Base');
const base = git(repository, 'rev-parse', 'HEAD');
git(repository, 'switch', '-qc', 'feature');
writeFileSync(join(repository, 'sample.ts'), 'export const result = 2;\n');
git(repository, 'commit', '-qam', 'Change the result');
const head = git(repository, 'rev-parse', 'HEAD');
mkdirSync(join(repository, 'new-folder'));
writeFileSync(join(repository, 'new-folder/item.txt'), 'before-nested-edit\n');
writeFileSync(
  join(bin, 'login-shell'),
  `#!${process.execPath}\nconsole.log('__PLOT_PATH__'+process.env.PATH+'__PLOT_PATH__');\n`,
  { mode: 0o700 },
);

const overview = {
  summary: 'The result now uses the updated value.',
  changes: [
    {
      title: 'Change the result',
      before: 'Uses one.',
      after: 'Uses two.',
      location: { path: 'sample.ts', line: 1 },
    },
  ],
  flows: [
    {
      title: 'Read a result',
      before: [{ from: 'Caller', to: 'Module', label: 'read one', location: null }],
      after: [
        {
          from: 'Caller',
          to: 'Module',
          label: 'read two',
          location: { path: 'sample.ts', line: 1 },
        },
      ],
    },
  ],
  architecture: {
    nodes: [
      { id: 'caller', label: 'Caller', status: 'unchanged', location: null },
      {
        id: 'module',
        label: 'Module',
        status: 'changed',
        location: { path: 'sample.ts', line: 1 },
      },
    ],
    edges: [{ from: 'caller', to: 'module', label: 'reads' }],
  },
  impacts: [],
  readingOrder: [{ path: 'sample.ts', reason: 'Defines the result.' }],
};
writeFileSync(
  join(bin, 'claude'),
  `#!${process.execPath}\nconsole.log(process.argv.includes('--version') ? '2.1.76 (Claude Code)' : JSON.stringify({loggedIn:true}));\n`,
  { mode: 0o700 },
);
writeFileSync(
  join(bin, 'codex'),
  `#!${process.execPath}
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex-cli fixture');
else if(args[0]==='login')console.log('Logged in');
else if(args[0]==='app-server')createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(!r.id)return;let result={};if(r.method==='account/read')result={account:{type:'chatgpt'}};if(r.method==='model/list')result={data:[{model:'fixture-model',displayName:'Fixture model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'high'}]}],nextCursor:null};console.log(JSON.stringify({id:r.id,result}))});
else if(args[0]==='exec'){writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(${JSON.stringify(overview)}));console.log(JSON.stringify({type:'turn.completed'}))}
`,
  { mode: 0o700 },
);

const cache = join(profile, 'repositories/github.com/octocat/hello-world.git');
mkdirSync(cache, { recursive: true });
git(cache, 'init', '--bare', '-q');
git(cache, 'remote', 'add', 'origin', `file://${repository}`);
const packagedExecutable = process.env.PLOT_E2E_EXECUTABLE;
const executablePath = packagedExecutable ?? createRequire(import.meta.url)('electron');
let app;
let page;
try {
  app = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`, ...(packagedExecutable ? [] : [root])],
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SHELL: join(bin, 'login-shell'),
    },
  });
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  await app.evaluate(
    ({ dialog, net, shell }, { repository, base, head }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [repository] });
      shell.openExternal = async () => {};
      const original = net.fetch.bind(net);
      net.fetch = async (url, init) => {
        const address = new URL(url);
        if (address.hostname !== 'api.github.com') return original(url, init);
        const user = { login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/1' };
        const pull = {
          number: 42,
          title: 'Fixture pull request',
          body: 'Updates a value.',
          html_url: 'https://github.com/octocat/hello-world/pull/42',
          updated_at: new Date().toISOString(),
          node_id: 'PR_fixture42',
          state: 'open',
          draft: false,
          merged: false,
          merged_at: null,
          user,
          base: {
            ref: 'main',
            sha: base,
            repo: { name: 'hello-world', owner: { login: 'octocat' } },
          },
          head: { ref: 'feature', sha: head },
          additions: 1,
          deletions: 1,
          changed_files: 1,
        };
        let value;
        if (address.pathname === '/user') value = user;
        else if (address.pathname === '/search/issues')
          value = {
            total_count: 1,
            items: [
              {
                ...pull,
                repository_url: 'https://api.github.com/repos/octocat/hello-world',
                pull_request: {
                  url: 'https://api.github.com/repos/octocat/hello-world/pulls/42',
                  merged_at: null,
                },
              },
            ],
          };
        else if (address.pathname.endsWith('/pulls/42')) value = pull;
        else if (address.pathname.includes('/compare/'))
          value = { merge_base_commit: { sha: base } };
        else if (address.pathname === '/user/repos') value = [];
        else
          return new Response(JSON.stringify({ message: 'Unknown fixture endpoint' }), {
            status: 404,
          });
        return new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json' },
        });
      };
    },
    { repository, base, head },
  );
  page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Open a local folder…', exact: true }).click();
  await page.getByRole('treeitem').filter({ hasText: 'item.txt' }).click();
  await page.locator('.monaco-editor').first().waitFor();
  assert.equal(
    await page.getByRole('complementary', { name: 'AI overview', exact: true }).count(),
    0,
  );
  pass('Open local work without GitHub or an unused AI panel');
  await page.waitForFunction(() =>
    document
      .querySelector('.editor.modified .view-lines')
      ?.textContent?.includes('before-nested-edit'),
  );
  writeFileSync(join(repository, 'new-folder/item.txt'), 'after-nested-edit\n');
  await page.waitForFunction(
    () =>
      document
        .querySelector('.editor.modified .view-lines')
        ?.textContent?.includes('after-nested-edit'),
    null,
    { timeout: 12_000 },
  );
  pass('Refresh nested untracked file contents automatically');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 600 }),
  );
  await page.waitForFunction(
    () =>
      innerWidth === 960 &&
      document.querySelector('main').getBoundingClientRect().width >= 480 &&
      document.body.scrollWidth <= innerWidth,
  );
  await page.getByRole('separator', { name: 'Resize the sidebar' }).press('End');
  await page.waitForFunction(
    () =>
      document.querySelector('main').getBoundingClientRect().width >= 480 &&
      document.body.scrollWidth <= innerWidth,
  );
  const bounds = await page.evaluate(() => ({
    code: document.querySelector('main').getBoundingClientRect().width,
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(bounds.code >= 480, JSON.stringify(bounds));
  assert.ok(bounds.body <= bounds.viewport, JSON.stringify(bounds));
  pass('Preserve code width and prevent panel overflow at 960 pixels');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1440, height: 900 }),
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'AI overview', exact: true }).click();
  await settings.getByText(/Update to Claude Code 2.1.248/).waitFor();
  pass('Explain incompatible Claude Code before execution');
  await settings.getByRole('button', { name: 'Appearance', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Runtime.evaluate', {
    expression: readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8'),
  });
  for (const name of ['Light', 'Dark', 'Darcula']) {
    await settings.getByRole('radio', { name, exact: true }).click();
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document.querySelector('dialog'), {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => ({ html: node.html, problem: node.failureSummary })),
      }));
    });
    assert.deepEqual(violations, [], `${name}: ${JSON.stringify(violations)}`);
  }
  pass('Pass settings accessibility checks in every theme');
  await settings.getByRole('button', { name: 'Accounts', exact: true }).click();
  await settings.getByRole('button', { name: 'Use a personal access token', exact: false }).click();
  await settings
    .getByLabel('Personal access token', { exact: true })
    .fill('fixture-token-never-sent-to-GitHub');
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  await settings.getByText('octocat', { exact: true }).first().waitFor();
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Pull requests', exact: true }).click();
  await page
    .getByRole('button', { name: /Fixture pull request/ })
    .first()
    .click();
  await page.getByRole('treeitem').filter({ hasText: 'sample.ts' }).click();
  await page.locator('.monaco-editor').first().waitFor();
  await page.getByRole('button', { name: 'Explain this change', exact: true }).click();
  await page.getByText(/Claude Code 2.1.248 or later is required/).waitFor();
  await page.getByRole('button', { name: 'Open AI settings', exact: true }).click();
  await settings.getByRole('radio', { name: /^Codex CLI/ }).click();
  await settings
    .getByRole('option', { name: 'Fixture model', exact: true })
    .waitFor({ state: 'attached' });
  await settings
    .getByRole('combobox', { name: 'Model', exact: true })
    .selectOption('fixture-model');
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText(overview.summary, { exact: true }).waitFor();
  await page.getByRole('img', { name: 'Components around this change', exact: true }).waitFor();
  pass('Recover from AI configuration errors and render an overview with diagrams');
  await page.getByRole('button', { name: 'sample.ts', exact: true }).first().click();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('result'),
  );
  pass('Navigate from AI evidence to the actual diff');
  const scripts = readdirSync(join(root, 'out/renderer/assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(root, 'out/renderer/assets', name), 'utf8'))
    .join('\n');
  assert.ok(!scripts.includes('DOMPurify 3.4.15'));
  assert.ok(scripts.includes('DOMPurify 3.4.17'));
  const notices = readFileSync(join(root, 'out/renderer/THIRD_PARTY_LICENSES.txt'), 'utf8');
  for (const required of [
    'react@',
    'mermaid@',
    'monaco-editor@',
    'lucide-react@',
    'ELK source for this version',
    'THIRD-PARTY SOFTWARE NOTICES AND INFORMATION',
  ])
    assert.ok(notices.includes(required), required);
  pass('Ship patched sanitizers and complete upstream notices');
  assert.deepEqual(errors, []);
  mkdirSync(join(root, 'dist'), { recursive: true });
  await page.screenshot({ path: join(root, 'dist/e2e-overview.png'), scale: 'css' });
  writeFileSync(
    join(root, 'dist/e2e-report.json'),
    JSON.stringify(
      {
        passed: results,
        rendererErrors: errors,
        liveServices: false,
        packaged: Boolean(packagedExecutable),
      },
      null,
      2,
    ),
  );
} catch (error) {
  mkdirSync(join(root, 'dist'), { recursive: true });
  await page
    ?.screenshot({ path: join(root, 'dist/e2e-failure.png'), scale: 'css' })
    .catch(() => {});
  throw error;
} finally {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
}
