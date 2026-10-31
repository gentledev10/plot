import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type BufferCommandRunner,
  CommandError,
  type CommandRunner,
  runCommand,
  runCommandForBuffer,
} from '../system/process';
import { isolatedGitEnvironment } from './environment';
import { createFixtureRepository, type FixtureRepository } from './fixture-repository';
import { createRepositoryCache, type RepositoryCacheOptions } from './repository-cache';

const repository = { host: 'github.com', owner: 'octocat', repo: 'hello-world' };

let fixture: FixtureRepository;

beforeAll(async () => {
  fixture = await createFixtureRepository();
});

afterAll(async () => {
  await fixture.cleanup();
});

let cacheCount = 0;

function setup(overrides: Partial<RepositoryCacheOptions> = {}) {
  const run = vi.fn<CommandRunner>(runCommand);
  const cache = createRepositoryCache({
    rootDir: join(fixture.root, `cache-${cacheCount++}`),
    run,
    runForBuffer: runCommandForBuffer,
    env: process.env,
    authHeader: async () => undefined,
    remoteUrl: () => fixture.url,
    ...overrides,
  });
  const fetches = () => run.mock.calls.filter(([, args]) => args.includes('fetch')).length;
  return { cache, run, fetches };
}

describe('createRepositoryCache', () => {
  it('diffs a pull request against its merge base', async () => {
    const { cache } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    const files = await cache.diff(repository, fixture.mergeBase, fixture.head);

    expect(files.map(({ path, status }) => [path, status])).toEqual([
      ['assets/logo.png', 'modified'],
      ['src/app.ts', 'modified'],
      ['src/new.ts', 'added'],
      ['src/old.ts', 'deleted'],
      ['src/renamed.ts', 'renamed'],
    ]);
    expect(files.find((file) => file.path === 'src/app.ts')).toMatchObject({
      additions: 2,
      deletions: 2,
    });
    expect(files.find((file) => file.path === 'src/renamed.ts')).toMatchObject({
      previousPath: 'src/rename-me.ts',
      additions: 1,
      deletions: 0,
    });
    expect(files.find((file) => file.path === 'assets/logo.png')).toMatchObject({
      additions: null,
      deletions: null,
    });
  });

  it('leaves out changes that landed on the base branch after the merge base', async () => {
    const { cache } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    const files = await cache.diff(repository, fixture.mergeBase, fixture.head);
    expect(files.map((file) => file.path)).not.toContain('docs/later.md');
  });

  it('fetches only the two commits, without history or unchanged file contents', async () => {
    const rootDir = join(fixture.root, 'cache-shallow');
    const { cache } = setup({ rootDir });
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    await cache.diff(repository, fixture.mergeBase, fixture.head);

    const gitDir = join(rootDir, 'github.com', 'octocat', 'hello-world.git');
    const git = async (...args: string[]) =>
      (
        await runCommand('git', ['--git-dir', gitDir, ...args], {
          env: isolatedGitEnvironment(process.env),
        })
      ).stdout;
    const objects = await git('rev-list', '--objects', '--missing=print', fixture.head);
    const bigBlob = (
      await runCommand('git', [
        '-C',
        fixture.url.replace('file://', ''),
        'rev-parse',
        `${fixture.head}:big.txt`,
      ])
    ).stdout.trim();

    expect(objects).toContain(`?${bigBlob}`);
    const shallow = (await readFile(join(gitDir, 'shallow'), 'utf8')).trim().split('\n');
    expect(shallow.sort()).toEqual([fixture.mergeBase, fixture.head].sort());
  });

  it('reads text, binary, and oversized files', async () => {
    const { cache } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    const files = await cache.diff(repository, fixture.mergeBase, fixture.head);
    const blobOf = (path: string) => files.find((file) => file.path === path)?.newBlob ?? '';

    const newFile = 'export const fresh = 1;\nexport const second = 2;\n';
    await expect(cache.readBlob(repository, blobOf('src/new.ts'), 1_000_000)).resolves.toEqual({
      kind: 'text',
      text: newFile,
    });
    await expect(cache.readBlob(repository, blobOf('assets/logo.png'), 1_000_000)).resolves.toEqual(
      {
        kind: 'binary',
        size: 6,
      },
    );
    await expect(cache.readBlob(repository, blobOf('src/new.ts'), 10)).resolves.toEqual({
      kind: 'too-large',
      size: Buffer.byteLength(newFile),
    });
  });

  it('does not fetch commits it already has', async () => {
    const { cache, fetches } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    await cache.fetchCommits(repository, [fixture.head, fixture.mergeBase]);
    expect(fetches()).toBe(1);
  });

  it('runs one fetch at a time per repository', async () => {
    const { cache, fetches } = setup();
    await Promise.all([
      cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]),
      cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]),
    ]);
    expect(fetches()).toBe(1);
  });

  it('ignores url rewrites and other settings in the user git config', async () => {
    const home = join(fixture.root, 'home');
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, '.gitconfig'),
      `[url "file:///nowhere/"]\n\tinsteadOf = ${fixture.url}\n`,
    );
    const { cache } = setup({ env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home } });

    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    await expect(cache.diff(repository, fixture.mergeBase, fixture.head)).resolves.toHaveLength(5);
  });

  it('reports commits the remote does not have', async () => {
    const { cache } = setup();
    await expect(cache.fetchCommits(repository, ['f'.repeat(40)])).rejects.toMatchObject({
      code: 'git-failed',
      message: expect.stringMatching(/^git fetch failed: /),
    });
  });

  it('retries a fetch that failed before', async () => {
    const { cache, fetches } = setup();
    await cache.fetchCommits(repository, ['f'.repeat(40)]).catch(() => {});
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    expect(fetches()).toBe(2);
  });

  it('explains how to install git when it is missing', async () => {
    const missing = () => Promise.reject(new CommandError('not-found', 'git', ''));
    const { cache } = setup({
      run: vi.fn<CommandRunner>(missing),
      runForBuffer: vi.fn<BufferCommandRunner>(missing),
    });
    await expect(cache.fetchCommits(repository, [fixture.head])).rejects.toMatchObject({
      code: 'git-not-installed',
    });
  });

  it('asks for credentials of the host the repository lives on', async () => {
    const authHeader = vi.fn(async () => undefined);
    const { cache } = setup({ authHeader });
    const enterprise = { ...repository, host: 'github.example.com' };

    await cache.fetchCommits(enterprise, [fixture.head]);

    expect(authHeader).toHaveBeenCalledWith(enterprise);
    expect(authHeader).not.toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }));
  });

  it('keeps each repository in its own directory, matching names without case', async () => {
    const rootDir = join(fixture.root, 'cache-layout');
    const { cache, run } = setup({ rootDir });
    await cache.fetchCommits({ host: 'github.com', owner: 'OctoCat', repo: 'Hello-World' }, [
      fixture.head,
    ]);

    const gitDirs = run.mock.calls.map(([, args]) => args[1]);
    expect(new Set(gitDirs)).toEqual(
      new Set([join(rootDir, 'github.com', 'octocat', 'hello-world.git')]),
    );
  });
});

describe('review workspace helpers', () => {
  it('checks out only the requested directories of a commit', async () => {
    const { cache } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);
    const target = join(fixture.root, 'workspace-sparse');

    await cache.checkoutDirectories(repository, fixture.head, ['src'], target);

    await expect(readFile(join(target, 'src/new.ts'), 'utf8')).resolves.toContain('fresh');
    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toBe('# Fixture\n');
    await expect(readFile(join(target, 'assets/logo.png'))).rejects.toThrow();

    await cache.removeCheckout(repository, target);
    await expect(readFile(join(target, 'README.md'))).rejects.toThrow();
  });

  it('writes the unified diff and lists every file without downloading contents', async () => {
    const { cache } = setup();
    await cache.fetchCommits(repository, [fixture.mergeBase, fixture.head]);

    const diff = await cache.unifiedDiff(repository, fixture.mergeBase, fixture.head);
    expect(diff).toContain('+++ b/src/new.ts');
    expect(diff).toContain('rename from src/rename-me.ts');

    await expect(cache.listFiles(repository, fixture.head)).resolves.toEqual([
      'README.md',
      'assets/logo.png',
      'big.txt',
      'src/app.ts',
      'src/new.ts',
      'src/renamed.ts',
    ]);
  });

  it('ignores removal requests for repositories it never created', async () => {
    const { cache } = setup();
    await expect(
      cache.removeCheckout({ host: 'github.com', owner: 'nobody', repo: 'nothing' }, '/tmp/none'),
    ).resolves.toBeUndefined();
  });
});
