import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const hangul = /\p{Script=Hangul}/u;
const allowlistPath = 'scripts/check-language-allowlist.json';
const allowlist = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, 'utf8')) : {};
const files = new Set(
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean),
);
let failed = false;
let checked = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  checked++;
  const remaining = [...(allowlist[file]?.lines ?? [])];
  for (const [index, line] of bytes.toString('utf8').split(/\r?\n/).entries()) {
    if (!hangul.test(line)) continue;
    const hash = createHash('sha256').update(line).digest('hex');
    const allowed = remaining.findIndex((entry) => entry.sha256 === hash);
    if (allowed !== -1) {
      remaining.splice(allowed, 1);
      continue;
    }
    console.error(`${file}:${index + 1}: Write project-authored prose in English.`);
    failed = true;
  }
}
console.log(`Language audit checked ${checked} text files.`);
process.exitCode = failed ? 1 : 0;
