import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const hangul = /\p{Script=Hangul}/u;
let failed = false;
function check(message, label) {
  if (!hangul.test(message)) return;
  console.error(`${label}: Write the commit message subject and body in English.`);
  failed = true;
}

try {
  if (args.length === 2 && args[0] === '--message-file') {
    check(readFileSync(args[1], 'utf8'), 'commit message');
  } else if (args.length === 4 && args[0] === '--base' && args[2] === '--head') {
    const git = (...arguments_) =>
      execFileSync('git', arguments_, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const base = git('rev-parse', '--verify', '--end-of-options', `${args[1]}^{commit}`).trim();
    const head = git('rev-parse', '--verify', '--end-of-options', `${args[3]}^{commit}`).trim();
    const commits = git('rev-list', `${base}..${head}`).trim().split('\n').filter(Boolean);
    for (const commit of commits) {
      check(git('show', '-s', '--format=%B', commit), `commit message ${commit}`);
    }
    console.log(`Checked ${commits.length} newly introduced commit messages.`);
  } else {
    throw new Error(
      'Use --message-file FILE or --base BASE --head HEAD. Historical commits are not checked.',
    );
  }
} catch (error) {
  console.error(error.message);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
