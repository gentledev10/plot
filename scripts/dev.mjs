import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { prepareDevRuntime, projectRoot } from './dev-runtime.mjs';

const require = createRequire(import.meta.url);
const executable = await prepareDevRuntime();
const cli = join(
  dirname(require.resolve('electron-vite/package.json')),
  require('electron-vite/package.json').bin['electron-vite'],
);
const child = spawn(process.execPath, [cli, 'dev', '--watch', ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, ...(executable ? { ELECTRON_EXEC_PATH: executable } : {}) },
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
