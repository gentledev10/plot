import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCommand } from '../system/process';
import { isolatedGitEnvironment } from './environment';

const env = {
  ...isolatedGitEnvironment(process.env),
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
};

export interface FixtureRepository {
  root: string;
  url: string;
  mergeBase: string;
  head: string;
  cleanup(): Promise<void>;
}

const RENAMED_LINES = Array.from({ length: 20 }, (_, i) => `export const value${i} = ${i};`);

export async function createFixtureRepository(): Promise<FixtureRepository> {
  const root = await mkdtemp(join(tmpdir(), 'plot-git-'));
  const dir = join(root, 'origin');
  await mkdir(dir);

  const git = async (...args: string[]) =>
    (await runCommand('git', ['-C', dir, ...args], { env })).stdout.trim();
  const write = async (files: Record<string, string | Buffer | null>) => {
    for (const [path, content] of Object.entries(files)) {
      const target = join(dir, path);
      if (content === null) {
        await rm(target);
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
    }
    await git('add', '-A');
  };

  await git('init', '--quiet', '--initial-branch=main');
  await git('config', 'uploadpack.allowFilter', 'true');
  await git('config', 'uploadpack.allowAnySHA1InWant', 'true');

  await write({
    'README.md': '# Fixture\n',
    'src/app.ts': 'export function greet() {\n  return "hello";\n}\n',
    'src/old.ts': 'export const old = true;\n',
    'src/rename-me.ts': `${RENAMED_LINES.join('\n')}\n`,
    'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
    'big.txt': 'x'.repeat(20_000),
  });
  await git('commit', '--quiet', '-m', 'Initial commit');
  const mergeBase = await git('rev-parse', 'HEAD');

  await git('switch', '--quiet', '-c', 'feature');
  await write({
    'src/app.ts': 'export function greet(name: string) {\n  return "hello " + name;\n}\n',
    'src/new.ts': 'export const fresh = 1;\nexport const second = 2;\n',
    'src/old.ts': null,
    'src/rename-me.ts': null,
    'src/renamed.ts': `${RENAMED_LINES.join('\n')}\nexport const added = true;\n`,
    'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x09]),
  });
  await git('commit', '--quiet', '-m', 'Feature work');
  const head = await git('rev-parse', 'HEAD');

  await git('switch', '--quiet', 'main');
  await write({ 'docs/later.md': 'Added to main after the branch.\n' });
  await git('commit', '--quiet', '-m', 'Later change on main');

  return {
    root,
    url: `file://${dir}`,
    mergeBase,
    head,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
