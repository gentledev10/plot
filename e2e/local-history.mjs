import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'plot-local-history-'));
const repository = join(scratch, 'repository');
const profile = join(scratch, 'profile');
const bin = join(scratch, 'bin');
for (const path of [repository, profile, bin]) mkdirSync(path, { recursive: true });
writeFileSync(
  join(profile, 'preferences.json'),
  JSON.stringify({ languages: { app: 'en', review: 'en' } }),
);
const fixtureReview = {
  summary: 'Fixture local overview for selected commits.',
  changes: [],
  flows: [],
  architecture: { nodes: [], edges: [] },
  impacts: [],
  readingOrder: [],
};
writeFileSync(
  join(bin, 'login-shell'),
  `#!${process.execPath}\nconsole.log('__PLOT_PATH__'+process.env.PATH+'__PLOT_PATH__');\n`,
  { mode: 0o700 },
);
writeFileSync(
  join(bin, 'claude'),
  `#!${process.execPath}\nconsole.log(process.argv.includes('--version') ? '2.1.76 (Claude Code)' : JSON.stringify({loggedIn:false}));\n`,
  { mode: 0o700 },
);
writeFileSync(
  join(bin, 'codex'),
  `#!${process.execPath}
import {createInterface} from 'node:readline';
import {writeFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex-cli fixture');
else if(args[0]==='login')console.log('Logged in');
else if(args[0]==='app-server')createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(!r.id)return;let result={};if(r.method==='account/read')result={account:{type:'chatgpt'}};if(r.method==='model/list')result={data:[{model:'fixture-model',displayName:'Fixture model',isDefault:true,supportedReasoningEfforts:[]}],nextCursor:null};console.log(JSON.stringify({id:r.id,result}))});
else if(args[0]==='exec'){appendFileSync(${JSON.stringify(join(scratch, 'generations'))},'fixture\\n');writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(${JSON.stringify(fixtureReview)}));console.log(JSON.stringify({type:'turn.completed'}))}
`,
  { mode: 0o700 },
);
const git = (...args) =>
  execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
const commitFile = (path, content, subject) => {
  writeFileSync(join(repository, path), content);
  git('add', '--', path);
  git('commit', '-qm', subject);
  return git('rev-parse', 'HEAD');
};
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Local history fixture');
git('config', 'user.email', 'fixture@example.com');
commitFile('base.txt', 'base\n', 'Create baseline');
git('switch', '-qc', 'feature');
const first = commitFile('first.txt', 'first-selected\n', 'First selected change');
commitFile('middle.txt', 'must-not-be-included\n', 'Unselected middle change');
const last = commitFile('last.txt', 'last-selected\n', 'Last selected change');
writeFileSync(join(repository, 'dirty.txt'), 'working-tree-only\n');
const before = {
  head: git('rev-parse', 'HEAD'),
  status: git('status', '--porcelain=v1'),
  index: git('ls-files', '--stage'),
};
const results = [];
const pass = (name) => {
  results.push(name);
  console.log(`PASS ${name}`);
};
let app;
let page;
try {
  app = await _electron.launch({
    executablePath: createRequire(import.meta.url)('electron'),
    args: [`--user-data-dir=${profile}`, root],
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SHELL: join(bin, 'login-shell') },
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, repository);
  page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Open a local folder…', exact: true }).click();
  const baseBranch = page.getByRole('combobox', { name: 'Base branch', exact: true });
  const compareBranch = page.getByRole('combobox', { name: 'Compare branch', exact: true });
  await baseBranch.selectOption('main');
  await compareBranch.selectOption('feature');
  await page.getByRole('checkbox', { name: 'Include uncommitted changes', exact: true }).uncheck();
  await page.getByRole('treeitem').filter({ hasText: 'first.txt' }).waitFor();
  assert.equal(await page.getByRole('treeitem').filter({ hasText: 'dirty.txt' }).count(), 0);
  await page.getByRole('treeitem').filter({ hasText: 'middle.txt' }).waitFor();
  pass('Compare selected branches without dirty files');
  mkdirSync(join(root, 'dist'), { recursive: true });
  await page.screenshot({ path: join(root, 'dist/local-history-branches.png'), scale: 'css' });
  await page.getByRole('checkbox', { name: 'Include uncommitted changes', exact: true }).check();
  await page.getByRole('treeitem').filter({ hasText: 'dirty.txt' }).waitFor();
  pass('Include working changes only on the checked-out branch');
  await page.getByRole('radio', { name: 'Selected commits', exact: true }).check();
  await page.getByRole('checkbox', { name: /First selected change/ }).check();
  await page.getByRole('checkbox', { name: /Last selected change/ }).check();
  await page.getByRole('treeitem').filter({ hasText: 'first.txt' }).waitFor();
  await page.getByRole('treeitem').filter({ hasText: 'last.txt' }).waitFor();
  assert.equal(await page.getByRole('treeitem').filter({ hasText: 'middle.txt' }).count(), 0);
  assert.equal(await page.getByRole('treeitem').filter({ hasText: 'dirty.txt' }).count(), 0);
  await page.getByRole('treeitem').filter({ hasText: 'last.txt' }).click();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('last-selected'),
  );
  pass('Analyze only nonconsecutive selected commits and read snapshot blobs');
  await page.getByRole('button', { name: 'AI overview', exact: true }).click();
  await page.getByText(/selected local diff and file contents are sent to Codex CLI/).waitFor();
  await page.getByRole('button', { name: 'Explain local changes', exact: true }).click();
  await page.getByText(fixtureReview.summary, { exact: true }).waitFor();
  assert.equal(readFileSync(join(scratch, 'generations'), 'utf8').trim().split('\n').length, 1);
  pass('Generate a local overview through real IPC and an isolated fixture AI CLI');
  await page.screenshot({
    path: join(root, 'dist/local-history-selected-commits.png'),
    scale: 'css',
  });
  await page.getByRole('radio', { name: 'Uncommitted only', exact: true }).check();
  await page.getByRole('treeitem').filter({ hasText: 'dirty.txt' }).waitFor();
  assert.equal(await page.getByText(fixtureReview.summary, { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Explain local changes', exact: true }).click();
  await page.getByText(fixtureReview.summary, { exact: true }).waitFor();
  assert.equal(readFileSync(join(scratch, 'generations'), 'utf8').trim().split('\n').length, 2);
  writeFileSync(join(repository, 'dirty.txt'), 'working-tree-edited\n');
  await page
    .getByText(fixtureReview.summary, { exact: true })
    .waitFor({ state: 'detached', timeout: 12_000 });
  writeFileSync(join(repository, 'dirty.txt'), 'working-tree-only\n');
  pass('Invalidate local overviews when the selection or working contents change');
  const actionBounds = await page
    .getByRole('button', { name: 'Choose another AI tool', exact: true })
    .evaluate((button) => {
      const first = button.getBoundingClientRect();
      const next = [...button.parentElement.querySelectorAll('button')]
        .find((item) => item.textContent === 'Explain local changes')
        .getBoundingClientRect();
      return { firstBottom: first.bottom, nextTop: next.top };
    });
  assert.ok(actionBounds.nextTop >= actionBounds.firstBottom + 8, JSON.stringify(actionBounds));
  pass('Separate local AI actions with readable spacing');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 600 }),
  );
  await page.waitForFunction(() => innerWidth === 960 && document.body.scrollWidth <= innerWidth);
  pass('Keep history controls inside a narrow window');
  mkdirSync(join(root, 'dist'), { recursive: true });
  await page.screenshot({ path: join(root, 'dist/local-history.png'), scale: 'css' });
  assert.deepEqual(errors, []);
  assert.equal(git('rev-parse', 'HEAD'), before.head);
  assert.equal(git('status', '--porcelain=v1'), before.status);
  assert.equal(git('ls-files', '--stage'), before.index);
  assert.equal(readFileSync(join(repository, 'dirty.txt'), 'utf8'), 'working-tree-only\n');
  pass('Preserve user HEAD, index and working files');
  writeFileSync(
    join(root, 'dist/local-history-report.json'),
    JSON.stringify({ passed: results, selectedCommits: [first, last] }, null, 2),
  );
} catch (error) {
  if (page) {
    mkdirSync(join(root, 'dist'), { recursive: true });
    await page
      .screenshot({ path: join(root, 'dist/local-history-failure.png'), scale: 'css' })
      .catch(() => {});
  }
  throw error;
} finally {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
}
