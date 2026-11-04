import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check-language.mjs', import.meta.url));
const commitChecker = fileURLToPath(new URL('./check-language-commits.mjs', import.meta.url));
const hook = fileURLToPath(new URL('../.githooks/commit-msg', import.meta.url));

test('commit-msg hook rejects Korean prose but permits Unicode punctuation', (t) => {
  const { cwd } = fixture(t);
  const message = join(cwd, 'message.txt');
  writeFileSync(message, 'Fix behavior — preserve Unicode\n');
  let result = spawnSync('sh', [hook, message], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const text of ['Fix behavior\n\n\uC124\uBA85\n', '\uC218\uC815\n']) {
    writeFileSync(message, text);
    result = spawnSync('sh', [hook, message], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /commit message.*English/);
  }
});

test('checks only newly introduced commits against the PR base', (t) => {
  const { cwd, git } = fixture(t);
  const commit = (message) =>
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-qm',
      message,
    );
  commit('\uC774\uC804 history');
  const base = git('rev-parse', 'HEAD');
  commit('Add English change');
  let result = spawnSync(process.execPath, [commitChecker, '--base', base, '--head', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 1 newly introduced commit messages/);
  commit('English subject\n\n\uC0C8 prose');
  result = spawnSync(process.execPath, [commitChecker, '--base', base, '--head', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commit message.*English/);
  assert.match(result.stdout, /Checked 2 newly introduced commit messages/);
  result = spawnSync(process.execPath, [commitChecker, '--base', base, '--head', base], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 0 newly introduced commit messages/);
});

test('commit range checker fails closed when the base cannot be resolved', (t) => {
  const { cwd } = fixture(t);
  const result = spawnSync(
    process.execPath,
    [commitChecker, '--base', 'missing', '--head', 'HEAD'],
    {
      cwd,
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0);
});

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'plot-language-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  return { cwd, git };
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [checker, ...args], { cwd, encoding: 'utf8' });
}

test('rejects a Korean comment in tracked authored source', (t) => {
  const { cwd, git } = fixture(t);
  writeFileSync(join(cwd, 'source.js'), '// \uD55C\uAD6D\uC5B4 comment\n');
  git('add', 'source.js');
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source\.js:1: Write project-authored prose in English/);
});

function allow(cwd, file, line) {
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  writeFileSync(
    join(cwd, 'scripts/check-language-allowlist.json'),
    JSON.stringify({
      [file]: {
        reason: 'Korean localization regression fixture.',
        lines: [{ line: 1, sha256: createHash('sha256').update(line).digest('hex') }],
      },
    }),
  );
}

test('preserves an explicitly reviewed localization line after an English line is inserted', (t) => {
  const { cwd, git } = fixture(t);
  const line = "export const label = '\uC124\uC815';";
  writeFileSync(join(cwd, 'localization.js'), `// English comment\n${line}\n`);
  allow(cwd, 'localization.js', line);
  git('add', '.');
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('does not allow a new Korean comment in an allowlisted test or translation file', (t) => {
  const { cwd, git } = fixture(t);
  const line = "export const label = '\uC124\uC815';";
  allow(cwd, 'localization.test.js', line);
  writeFileSync(join(cwd, 'localization.test.js'), `${line}\n// \uC124\uBA85\n`);
  git('add', '.');
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /localization\.test\.js:2:/);
  assert.doesNotMatch(result.stderr, /localization\.test\.js:1:/);
});

test('preserves the reviewed Korean values in the real canonical catalog', (t) => {
  const { cwd } = fixture(t);
  mkdirSync(join(cwd, 'src/shared'), { recursive: true });
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  for (const file of ['src/shared/translations.ts', 'scripts/check-language-allowlist.json']) {
    writeFileSync(join(cwd, file), readFileSync(new URL(`../${file}`, import.meta.url)));
  }
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('rejects standalone and inline Korean comments in the canonical translation catalog', (t) => {
  const { cwd } = fixture(t);
  const file = 'src/shared/translations.ts';
  const line = "  Settings: '\uC124\uC815',";
  mkdirSync(join(cwd, 'src/shared'), { recursive: true });
  allow(cwd, file, line);
  writeFileSync(join(cwd, file), `export const korean = {\n${line}\n};\n`);
  assert.equal(run(cwd).status, 0);
  writeFileSync(
    join(cwd, file),
    `export const korean = {\n${line}\n// \uC124\uBA85\n${line} // \uC124\uBA85\n};\n`,
  );
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/shared\/translations\.ts:3:/);
  assert.match(result.stderr, /src\/shared\/translations\.ts:4:/);
  assert.doesNotMatch(result.stderr, /src\/shared\/translations\.ts:2:/);
});

test('requires explicit review for a new Korean catalog value', (t) => {
  const { cwd } = fixture(t);
  mkdirSync(join(cwd, 'src/shared'), { recursive: true });
  writeFileSync(
    join(cwd, 'src/shared/translations.ts'),
    "export const korean = { Settings: '\uC124\uC815' };\n",
  );
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/shared\/translations\.ts:1:/);
});

test('does not allow additional copies of a reviewed line', (t) => {
  const { cwd, git } = fixture(t);
  const line = "const label = '\uC124\uC815';";
  allow(cwd, 'localization.js', line);
  writeFileSync(join(cwd, 'localization.js'), `${line}\n${line}\n`);
  git('add', '.');
  assert.equal(run(cwd).status, 1);
});

test('checks new nonignored files without requiring staging', (t) => {
  const { cwd } = fixture(t);
  writeFileSync(join(cwd, 'new.md'), '\uC124\uBA85');
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new\.md:1:/);
});

test('ignores binary files, ignored artifacts, and permits Unicode punctuation', (t) => {
  const { cwd, git } = fixture(t);
  writeFileSync(join(cwd, 'image.bin'), Buffer.from('\0\uC124\uBA85'));
  writeFileSync(join(cwd, '.gitignore'), 'generated.txt\n');
  writeFileSync(join(cwd, 'generated.txt'), '\uC124\uBA85');
  writeFileSync(join(cwd, 'README.md'), 'English prose — café → ✓\n');
  git('add', '.');
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});
