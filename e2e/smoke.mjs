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
const longSourcePath =
  'packages/review/src/features/understandingCodeChangesAndNavigatingToTheCorrectSourceLocation.ts';
const bin = join(scratch, 'bin');
const results = [];
mkdirSync(join(root, 'dist'), { recursive: true });
const pass = (name) => {
  results.push(name);
  console.log(`PASS ${name}`);
};
for (const path of [profile, repository, bin]) mkdirSync(path, { recursive: true });
writeFileSync(
  join(profile, 'preferences.json'),
  JSON.stringify({ languages: { app: 'en', review: 'app' } }),
);
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
mkdirSync(dirname(join(repository, longSourcePath)), { recursive: true });
writeFileSync(join(repository, longSourcePath), 'export const evidence = "long-path";\n');
git(repository, 'add', '.');
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
      location: { path: longSourcePath, line: 1 },
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
const koreanOverview = {
  ...overview,
  summary: '결과 값이 1에서 2로 변경됩니다.',
  changes: [
    {
      ...overview.changes[0],
      title: '결과 값 변경',
      before: '1을 사용합니다.',
      after: '2를 사용합니다.',
    },
  ],
  flows: [
    {
      title: '결과 읽기',
      before: [{ from: '호출부', to: '모듈', label: '기존 값 읽기', location: null }],
      after: [
        {
          from: '호출부',
          to: '모듈',
          label: '새 값 읽기',
          location: { path: 'sample.ts', line: 1 },
        },
      ],
    },
  ],
  architecture: {
    ...overview.architecture,
    edges: overview.architecture.edges.map((edge) => ({ ...edge, label: '읽기' })),
    nodes: overview.architecture.nodes.map((node, i) => ({
      ...node,
      label: i === 0 ? '호출부' : '모듈',
    })),
  },
  readingOrder: [{ path: 'sample.ts', reason: '결과 값을 정의합니다.' }],
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
import {writeFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex-cli fixture');
else if(args[0]==='login')console.log('Logged in');
else if(args[0]==='app-server')createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(!r.id)return;let result={};if(r.method==='account/read')result={account:{type:'chatgpt'}};if(r.method==='model/list')result={data:[{model:'fixture-model',displayName:'Fixture model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'high'}]}],nextCursor:null};console.log(JSON.stringify({id:r.id,result}))});
else if(args[0]==='exec'){const korean=args.at(-1).includes('Write all prose in Korean.');appendFileSync(${JSON.stringify(join(scratch, 'generation-count'))},(korean?'ko':'en')+String.fromCharCode(10));const output=korean?${JSON.stringify(koreanOverview)}:${JSON.stringify(overview)};const config=args.at(-1).split(String.fromCharCode(10)).find(line=>line.startsWith('REVIEW_STEPS_JSON:'));const steps=JSON.parse(config.slice('REVIEW_STEPS_JSON:'.length));output.customSections=steps.filter(step=>step.kind==='custom').map(step=>({id:step.id,body:korean?'추가 관점 분석입니다.':'Additional perspective.',items:step.format==='checklist'?[{area:korean?'호출부 확인':'Check callers',detail:step.instructions,location:{path:'sample.ts',line:1}}]:[],diagram:step.format==='diagram'?{...output.architecture,kind:step.instructions.includes('순서')?'sequence':'components'}:null}));writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(output));console.log(JSON.stringify({type:'turn.completed'}))}
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
          additions: 2,
          deletions: 1,
          changed_files: 2,
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
  await page.getByRole('heading', { name: 'Open changes', exact: true }).waitFor();
  await page.screenshot({ path: join(root, 'dist/e2e-start.png'), scale: 'css' });
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
  const settings = page.getByRole('dialog');
  assert.equal(
    await settings
      .getByRole('list', { name: 'AI overview settings', exact: true })
      .getByRole('button', { name: 'Review format', exact: true })
      .count(),
    1,
  );
  await settings.getByRole('button', { name: 'AI overview', exact: true }).click();
  await settings.getByText(/Update to Claude Code 2.1.248/).waitFor();
  assert.equal(await settings.getByRole('radio', { name: /^Codex CLI/ }).isChecked(), true);
  assert.equal(
    await settings
      .getByRole('checkbox', { name: 'Choose an available tool automatically' })
      .isChecked(),
    true,
  );
  await settings.getByRole('radio', { name: /^Claude Code/ }).click();
  pass('Select the ready AI tool automatically and preserve a manual choice');
  pass('Explain incompatible Claude Code before execution');
  await settings.getByRole('button', { name: 'Appearance', exact: true }).click();
  const initialSettings = await settings.boundingBox();
  await page.mouse.move(
    initialSettings.x + initialSettings.width - 3,
    initialSettings.y + initialSettings.height - 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    initialSettings.x + initialSettings.width + 117,
    initialSettings.y + initialSettings.height + 77,
    { steps: 10 },
  );
  await page.mouse.up();
  const resizedSettings = await settings.boundingBox();
  assert.ok(resizedSettings.width > initialSettings.width + 80);
  assert.ok(resizedSettings.height > initialSettings.height + 40);
  await settings.getByRole('button', { name: 'Expand settings', exact: true }).click();
  await page.waitForFunction(() => {
    const bounds = document.querySelector('dialog').getBoundingClientRect();
    return bounds.width >= innerWidth - 34 && bounds.height >= innerHeight - 34;
  });
  await settings.getByRole('button', { name: 'Restore settings size', exact: true }).click();
  await page.waitForFunction(
    (expected) =>
      Math.abs(document.querySelector('dialog').getBoundingClientRect().width - expected) < 2,
    resizedSettings.width,
  );
  const arrowInset = await settings
    .getByRole('combobox', { name: 'Font', exact: true })
    .evaluate(
      (select) =>
        select.getBoundingClientRect().right -
        select.parentElement.querySelector('svg').getBoundingClientRect().right,
    );
  assert.ok(arrowInset >= 9 && arrowInset <= 12, String(arrowInset));
  await page.screenshot({ path: join(root, 'dist/e2e-appearance.png'), scale: 'css' });
  pass('Resize and expand settings, restore the chosen size and inset select arrows');
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
  const changesCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /What changed/ }) });
  await changesCard.getByRole('button', { name: longSourcePath, exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('long-path'),
  );
  const cardOverflow = await changesCard.evaluate((card) => ({
    left: card.scrollLeft,
    width: card.clientWidth,
    content: card.scrollWidth,
  }));
  assert.equal(cardOverflow.left, 0, JSON.stringify(cardOverflow));
  assert.ok(cardOverflow.content <= cardOverflow.width + 1, JSON.stringify(cardOverflow));
  pass('Keep long evidence paths inside review cards after navigating to code');
  await page.getByRole('button', { name: 'sample.ts', exact: true }).first().click();
  await page.waitForFunction(() =>
    document.querySelector('.editor.modified .view-lines')?.textContent?.includes('result'),
  );
  pass('Navigate from AI evidence to the actual diff');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settings.getByRole('button', { name: 'Language', exact: true }).click();
  await settings.getByLabel('AI review language', { exact: true }).selectOption('ko');
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Explain this change', exact: true }).waitFor();
  assert.equal(await page.getByText(overview.summary, { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Explain this change', exact: true }).click();
  await page.getByText(koreanOverview.summary, { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
  pass('Generate Korean explanations with an English app without reusing an English review');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settings.getByRole('button', { name: 'Language', exact: true }).click();
  await settings.getByLabel('App language', { exact: true }).selectOption('ko');
  await settings.getByLabel('앱 표시 언어', { exact: true }).waitFor();
  await page.screenshot({ path: join(root, 'dist/e2e-language-settings.png'), scale: 'css' });
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('heading', { name: '요약', exact: true }).waitFor();
  assert.ok(
    (
      await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((item) => item.label))
    ).includes('파일'),
  );
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await settings.getByRole('button', { name: '언어', exact: true }).click();
  await settings.getByLabel('AI 리뷰 언어', { exact: true }).selectOption('en');
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByText(overview.summary, { exact: true }).waitFor();
  assert.equal(
    readFileSync(join(scratch, 'generation-count'), 'utf8').trim().split('\n').length,
    2,
  );
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await settings.getByRole('button', { name: '언어', exact: true }).click();
  await settings.getByLabel('AI 리뷰 언어', { exact: true }).selectOption('app');
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByText(koreanOverview.summary, { exact: true }).waitFor();
  assert.equal(
    readFileSync(join(scratch, 'generation-count'), 'utf8').trim().split('\n').length,
    2,
  );
  pass(
    'Switch app and review languages independently and reuse each language without extra AI calls',
  );
  await page.getByRole('button', { name: '리뷰 구성', exact: true }).click();
  const steps = settings.getByRole('list', { name: '리뷰 단계' });
  const architectureStep = steps.locator('[data-step-id="architecture"]');
  const summaryStep = steps.locator('[data-step-id="summary"]');
  const summaryBox = await summaryStep.boundingBox();
  assert.ok(summaryBox);
  await architectureStep.getByRole('button', { name: /끌어서 이동/ }).dragTo(summaryStep, {
    targetPosition: { x: 50, y: 3 },
  });
  assert.equal(
    await steps.getByRole('listitem').first().getAttribute('data-step-id'),
    'architecture',
  );
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  const overviewPanel = page.getByRole('complementary', { name: 'AI 리뷰', exact: true });
  assert.equal(
    await overviewPanel.getByRole('article').first().getAttribute('data-step-id'),
    'architecture',
  );
  assert.equal(await overviewPanel.getByText(/리뷰 지침이 바뀌었습니다/).count(), 0);
  assert.equal(
    readFileSync(join(scratch, 'generation-count'), 'utf8').trim().split('\n').length,
    2,
  );
  pass('Drag review cards into a new reading order without another AI call');

  await page.getByRole('button', { name: '리뷰 구성', exact: true }).click();
  await settings.getByRole('button', { name: '요약 삭제', exact: true }).click();
  assert.equal(await steps.locator('[data-step-id="summary"]').count(), 0);
  await settings.getByRole('button', { name: '단계 추가', exact: true }).click();
  assert.equal(await settings.getByLabel('카드 제목', { exact: true }).inputValue(), '');
  assert.equal(
    await settings.getByLabel('AI에게 추가로 요청할 내용', { exact: true }).inputValue(),
    '',
  );
  await settings.getByLabel('카드 제목', { exact: true }).fill('실패 시 확인할 점');
  await settings.getByLabel('표현 방식', { exact: true }).selectOption('checklist');
  await settings
    .getByLabel('AI에게 추가로 요청할 내용', { exact: true })
    .fill('값을 읽는 호출부와 롤백 영향을 확인해 주세요.');
  await settings.getByRole('button', { name: '단계 추가', exact: true }).click();
  await settings.getByLabel('카드 제목', { exact: true }).fill('호출부 관계');
  await settings.getByLabel('표현 방식', { exact: true }).selectOption('diagram');
  await settings
    .getByLabel('AI에게 추가로 요청할 내용', { exact: true })
    .fill('값을 읽는 호출 순서를 시간 순으로 보여 주세요.');
  const reviewFormatA11y = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('dialog'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact }));
  });
  assert.deepEqual(reviewFormatA11y, []);
  await page.screenshot({ path: join(root, 'dist/e2e-review-format.png'), scale: 'css' });
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  assert.equal(
    JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8'))['review-plan'].steps.some(
      (step) => step.id === 'summary',
    ),
    false,
  );
  await overviewPanel.getByText(/리뷰 지침이 바뀌었습니다/).waitFor();
  assert.equal(
    readFileSync(join(scratch, 'generation-count'), 'utf8').trim().split('\n').length,
    2,
  );
  await overviewPanel.getByRole('button', { name: '다시 생성', exact: true }).last().click();
  await overviewPanel.getByText('추가 관점 분석입니다.', { exact: true }).first().waitFor();
  await overviewPanel
    .getByRole('article', { name: /실패 시 확인할 점/ })
    .getByText('호출부 확인', { exact: true })
    .waitFor();
  await overviewPanel
    .getByRole('article', { name: /호출부 관계/ })
    .getByRole('img', { name: '호출 순서 그림', exact: true })
    .waitFor();
  assert.equal(await overviewPanel.getByText(/리뷰 지침이 바뀌었습니다/).count(), 0);
  assert.equal(
    readFileSync(join(scratch, 'generation-count'), 'utf8').trim().split('\n').length,
    3,
  );
  assert.equal(
    await overviewPanel
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /^요약$/ }) })
      .count(),
    0,
  );
  pass('Delete a built-in step persistently and start new steps with placeholder-only fields');
  pass('Save custom checklist and diagram stages and generate them in one analysis');
  const customCard = overviewPanel.getByRole('article', { name: /실패 시 확인할 점/ });
  await customCard.getByRole('button', { name: /실패 시 확인할 점/ }).click();
  assert.equal(await customCard.getByText('호출부 확인', { exact: true }).isVisible(), false);
  await customCard.getByRole('button', { name: /실패 시 확인할 점/ }).click();
  await customCard.getByRole('button', { name: 'sample.ts', exact: true }).click();
  pass('Collapse review cards and navigate custom evidence to the diff');
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
