import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChangedFile } from '@shared/diff';
import type { Language } from '@shared/language';
import type { LocalTarget } from '@shared/local';
import { defaultReviewPlan, type ReviewPlan } from '@shared/review-plan';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentRunInput } from '../ai/agent';
import { isolatedGitEnvironment } from '../git/environment';
import { createLocalGit } from '../local/local-git';
import { createLocalRepositoryStore } from '../local/local-repositories';
import { runCommand, runCommandForBuffer } from '../system/process';
import { createLocalReviewService } from './local-review-service';
import { createLocalService } from './local-service';

const target: LocalTarget = { repositoryId: 'a'.repeat(16), compare: 'uncommitted' };
const file: ChangedFile = {
  path: 'src/app.ts',
  kind: 'file',
  status: 'modified',
  oldBlob: 'b'.repeat(40),
  newBlob: null,
  additions: 1,
  deletions: 1,
};
// Deliberately synthetic agent output. No provider process or paid AI is executed.
const fixture = {
  summary: 'Fake-agent fixture overview.',
  changes: [
    {
      title: 'Fixture change',
      before: 'Before',
      after: 'After',
      location: { path: file.path, line: 1 },
    },
  ],
  flows: [],
  architecture: { nodes: [], edges: [] },
  impacts: [],
  readingOrder: [],
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
async function setup(run = async (_input: AgentRunInput) => ({ output: fixture })) {
  const root = await mkdtemp(join(tmpdir(), 'plot-local-review-test-'));
  roots.push(root);
  const local = {
    getLocalSignature: vi.fn(async () => 'cheap-signature'),
    getLocalDiff: vi.fn(async () => ({ branch: 'feature', base: null, files: [file] })),
    readLocalBlob: vi.fn(async () => ({ kind: 'text' as const, text: 'before\n' })),
    readLocalFile: vi.fn(async () => ({ kind: 'text' as const, text: 'after\n' })),
  };
  const agent = { run: vi.fn(run) };
  const options = {
    local,
    workspaceRoot: join(root, 'workspaces'),
    cacheRoot: join(root, 'cache'),
    resolveAgent: vi.fn(async () => ({
      provider: 'codex' as const,
      model: 'fake-agent-fixture',
      agent,
    })),
    language: async () => 'en' as const,
  };
  const service = createLocalReviewService(options);
  const settled = () =>
    vi.waitFor(async () => {
      expect((await service.getLocalReviewStatus(target)).state).not.toBe('running');
    });
  return { root, local, agent, options, service, settled };
}
it('runs the selected agent against isolated selected snapshots and returns verified local overview status', async () => {
  let workspace = '';
  const { root, service, settled, agent } = await setup(async (input) => {
    workspace = input.cwd;
    expect(await readFile(join(input.cwd, file.path), 'utf8')).toBe('after\n');
    expect(input.prompt).toContain('local comparison');
    expect(input.prompt).toContain('Write all prose in English.');
    expect(input.prompt).toContain('Do not run tests or build commands.');
    expect(await readFile(join(input.contextDir, 'pull-request.diff'), 'utf8')).toContain(
      '-before\n+after',
    );
    input.onActivity('Reading selected snapshot');
    return { output: fixture };
  });
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  expect(agent.run).not.toHaveBeenCalled();
  await service.startLocalReview(target);
  await settled();
  expect(await service.getLocalReviewStatus(target)).toMatchObject({
    state: 'done',
    provider: 'codex',
    model: 'fake-agent-fixture',
    review: { changes: [{ location: { verified: true } }] },
  });
  await vi.waitFor(async () => {
    expect(await readdir(join(root, 'workspaces'))).toEqual([]);
  });
  expect(workspace).toContain(join(root, 'workspaces'));
});

it('never serves changed working-tree bytes as current even when the cheap signature is unchanged', async () => {
  const { service, local, settled, options, agent } = await setup();
  await service.startLocalReview(target);
  await settled();
  const original = await service.getLocalReviewStatus(target);
  expect(original.state).toBe('done');
  local.readLocalFile.mockResolvedValue({ kind: 'text', text: 'other\n' });
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  local.readLocalFile.mockResolvedValue({ kind: 'text', text: 'after\n' });
  const reopened = createLocalReviewService(options);
  expect(await reopened.getLocalReviewStatus(target)).toMatchObject({
    state: 'done',
    head: original.state === 'done' ? original.head : '',
  });
  expect(agent.run).toHaveBeenCalledOnce();
});
it('keys cache by exact target, language and content-affecting plan without automatically running AI', async () => {
  const { options, agent } = await setup();
  let language: Language = 'en';
  let plan = defaultReviewPlan();
  const service = createLocalReviewService({
    ...options,
    language: async () => language,
    plan: async () => plan,
  });
  await service.startLocalReview(target);
  await vi.waitFor(async () => {
    expect((await service.getLocalReviewStatus(target)).state).toBe('done');
  });
  language = 'ko';
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  language = 'en';
  expect((await service.getLocalReviewStatus(target)).state).toBe('done');
  plan = {
    steps: plan.steps.map((step) => ({ ...step, instructions: 'Different content instructions' })),
  };
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  expect(await service.getLocalReviewStatus({ ...target, compare: 'branch' })).toEqual({
    state: 'idle',
  });
  expect(agent.run).toHaveBeenCalledOnce();
});
it.each(['language', 'plan'] as const)(
  'separates in-flight jobs by %s and preserves a replacement when an old result arrives',
  async (setting) => {
    const completions: (() => void)[] = [];
    const { options, agent } = await setup(async () => {
      await new Promise<void>((resolve) => completions.push(resolve));
      return { output: fixture };
    });
    let language: Language = 'en';
    let plan = defaultReviewPlan();
    const service = createLocalReviewService({
      ...options,
      language: async () => language,
      plan: async () => plan,
    });
    await service.startLocalReview(target);
    await vi.waitFor(() => expect(agent.run).toHaveBeenCalledTimes(1));
    if (setting === 'language') language = 'ko';
    else plan = { steps: plan.steps.filter((step) => step.kind === 'summary') };
    expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
    await service.startLocalReview(target);
    await vi.waitFor(() => expect(agent.run).toHaveBeenCalledTimes(2));
    completions[0]?.();
    await vi.waitFor(async () => {
      expect(agent.run.mock.calls[0]?.[0].signal.aborted).toBe(true);
      expect(await readdir(options.workspaceRoot)).toHaveLength(1);
    });
    expect((await service.getLocalReviewStatus(target)).state).toBe('running');
    completions[1]?.();
    await vi.waitFor(async () => {
      expect(await service.getLocalReviewStatus(target)).toMatchObject({ state: 'done', language });
    });
  },
);

it('discards an in-flight overview when selected files change before the fake agent finishes', async () => {
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const { service, local, agent, settled } = await setup(async () => {
    await done;
    return { output: fixture };
  });
  await service.startLocalReview(target);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledOnce());
  local.readLocalFile.mockResolvedValue({ kind: 'text', text: 'changed during generation\n' });
  complete();
  await settled();
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
});

it('cancels a running fake agent, drops its late result, cleans scratch data and allows a fresh run', async () => {
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let signal: AbortSignal | undefined;
  const { service, agent, root, settled } = await setup(async (input) => {
    signal = input.signal;
    await done;
    return { output: fixture };
  });
  await Promise.all([service.startLocalReview(target), service.startLocalReview(target)]);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledOnce());
  await service.cancelLocalReview(target);
  expect(signal?.aborted).toBe(true);
  complete();
  await settled();
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  await vi.waitFor(async () => {
    expect(await readdir(join(root, 'workspaces'))).toEqual([]);
  });
  await service.startLocalReview(target);
  await settled();
  expect((await service.getLocalReviewStatus(target)).state).toBe('done');
});
it('starts a replacement immediately after cancellation even if the old agent has not settled', async () => {
  const completions: (() => void)[] = [];
  const { options, agent } = await setup(async () => {
    await new Promise<void>((resolve) => completions.push(resolve));
    return { output: fixture };
  });
  const service = createLocalReviewService(options);
  await service.startLocalReview(target);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledTimes(1));
  await service.cancelLocalReview(target);
  await service.startLocalReview(target);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledTimes(2));
  completions[0]?.();
  await vi.waitFor(async () => expect(await readdir(options.workspaceRoot)).toHaveLength(1));
  expect((await service.getLocalReviewStatus(target)).state).toBe('running');
  completions[1]?.();
  await vi.waitFor(async () =>
    expect((await service.getLocalReviewStatus(target)).state).toBe('done'),
  );
});

it('does not let a delayed older start replace a newer settings snapshot', async () => {
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const { options, agent } = await setup(async () => {
    await done;
    return { output: fixture };
  });
  let resolveFirst!: (language: Language) => void;
  const firstLanguage = new Promise<Language>((resolve) => {
    resolveFirst = resolve;
  });
  const language = vi.fn().mockReturnValueOnce(firstLanguage).mockResolvedValue('ko');
  const service = createLocalReviewService({ ...options, language });
  const older = service.startLocalReview(target);
  await service.startLocalReview(target);
  await vi.waitFor(() => expect(agent.run).toHaveBeenCalledOnce());
  resolveFirst('en');
  await older;
  expect(agent.run.mock.calls[0]?.[0].signal.aborted).toBe(false);
  complete();
  await vi.waitFor(async () =>
    expect(await service.getLocalReviewStatus(target)).toMatchObject({
      state: 'done',
      language: 'ko',
    }),
  );
  expect(agent.run).toHaveBeenCalledOnce();
});

it('cancels startup while settings are resolving without launching a paid agent afterward', async () => {
  const { options, agent } = await setup();
  let resolveLanguage!: (language: Language) => void;
  const language = new Promise<Language>((resolve) => {
    resolveLanguage = resolve;
  });
  const service = createLocalReviewService({ ...options, language: () => language });
  const starting = service.startLocalReview(target);
  await service.cancelLocalReview(target);
  resolveLanguage('en');
  await starting;
  expect(await service.getLocalReviewStatus(target)).toEqual({ state: 'idle' });
  expect(agent.run).not.toHaveBeenCalled();
});

it('does not invoke the agent for invalid plans or an empty diff', async () => {
  const { options, agent, local } = await setup();
  const service = createLocalReviewService({ ...options, plan: async () => ({ steps: [] }) });
  await expect(service.startLocalReview(target)).rejects.toMatchObject({
    code: 'ai-not-configured',
  });
  local.getLocalDiff.mockResolvedValue({ branch: 'feature', base: null, files: [] });
  const empty = createLocalReviewService(options);
  await empty.startLocalReview(target);
  await vi.waitFor(async () => {
    expect((await empty.getLocalReviewStatus(target)).state).toBe('failed');
  });
  expect(agent.run).not.toHaveBeenCalled();
});
it('rejects missing custom output and strips removed plan sections', async () => {
  const { options } = await setup();
  const custom: ReviewPlan = {
    steps: [
      {
        id: 'custom_extra',
        kind: 'custom',
        title: 'Extra',
        instructions: 'Explain recovery',
        detail: 'balanced',
        visible: true,
        format: 'text',
      },
    ],
  };
  const service = createLocalReviewService({ ...options, plan: async () => custom });
  await service.startLocalReview(target);
  await vi.waitFor(async () => {
    expect(await service.getLocalReviewStatus(target)).toMatchObject({
      state: 'failed',
      error: { code: 'ai-invalid-output' },
    });
  });
  const summaryOnly = createLocalReviewService({
    ...options,
    plan: async () => ({
      steps: defaultReviewPlan().steps.filter((step) => step.kind === 'summary'),
    }),
  });
  await summaryOnly.startLocalReview(target);
  await vi.waitFor(async () => {
    expect(await summaryOnly.getLocalReviewStatus(target)).toMatchObject({
      state: 'done',
      review: { summary: fixture.summary, changes: [], readingOrder: [] },
    });
  });
});
it('uses historical after blobs rather than current disk for commit snapshots', async () => {
  const { options, local } = await setup();
  local.getLocalDiff.mockResolvedValue({
    branch: 'feature',
    base: null,
    files: [{ ...file, newBlob: 'c'.repeat(40) }],
  });
  const service = createLocalReviewService(options);
  await service.startLocalReview(target);
  await vi.waitFor(async () => {
    expect((await service.getLocalReviewStatus(target)).state).toBe('done');
  });
  expect(local.readLocalFile).not.toHaveBeenCalled();
  expect(local.readLocalBlob).toHaveBeenCalledWith(target.repositoryId, 'c'.repeat(40));
});

// Supplemental composition-root wiring check; service execution is exercised above.
it('wires local reviews to the same authorized local service and restricted agent resolver', async () => {
  const source = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  expect(source).toContain('const local = createLocalService(');
  expect(source).toContain('...createLocalReviewService({');
  expect(source).toMatch(
    /createLocalReviewService\(\{\s*local,\s*resolveAgent: resolveReviewAgent/,
  );
  expect(source).toContain('...local,');
});

it('reviews a real repository without changing any source working file, index, config or git object', async () => {
  const { root, options } = await setup();
  const repo = join(root, 'source-repository');
  await mkdir(repo);
  const git = (...args: string[]) =>
    runCommand('git', args, { cwd: repo, env: isolatedGitEnvironment(process.env) });
  await git('init', '--quiet', '--template=');
  await writeFile(join(repo, 'app.ts'), 'baseline\n');
  await writeFile(join(repo, '.gitignore'), 'private-fixture.txt\n');
  await git('add', '--all');
  // Commits exist only in this disposable integration fixture, never in the task repository.
  await git(
    '-c',
    'user.name=Plot test fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'Disposable fixture baseline',
  );
  await git('config', 'remote.origin.url', 'https://fixture.invalid/private.git');
  await git('config', 'credential.helper', 'test-fixture-only-not-a-real-secret');
  await writeFile(join(repo, 'private-fixture.txt'), 'Unselected fake private fixture');
  await writeFile(join(repo, 'app.ts'), 'staged fixture\n');
  await git('add', 'app.ts');
  await writeFile(join(repo, 'app.ts'), 'working fixture\n');
  const fingerprint = async () => {
    const entries = (await readdir(repo, { recursive: true, withFileTypes: true })).filter(
      (entry) => entry.isFile(),
    );
    const values = await Promise.all(
      entries.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [
          path,
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ];
      }),
    );
    return values.sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''));
  };
  const before = await fingerprint();
  const repositories = createLocalRepositoryStore(join(root, 'authorized-repositories.json'));
  const repository = await repositories.add(repo);
  const local = createLocalService({
    repositories,
    git: createLocalGit({ run: runCommand, runForBuffer: runCommandForBuffer, env: process.env }),
    chooseFolder: async () => undefined,
    findOpenPullRequest: async () => null,
  });
  const agent = {
    run: vi.fn(async (input: AgentRunInput) => {
      expect(input.cwd).not.toContain(repo);
      expect(await readFile(join(input.cwd, 'app.ts'), 'utf8')).toBe('working fixture\n');
      await expect(readFile(join(input.cwd, 'private-fixture.txt'))).rejects.toThrow();
      expect(await readFile(join(input.cwd, '.git/config'), 'utf8')).not.toMatch(
        /fixture.invalid|credential/,
      );
      return { output: fixture };
    }),
  };
  const service = createLocalReviewService({
    ...options,
    local,
    resolveAgent: async () => ({ provider: 'codex', model: 'fake-agent-fixture', agent }),
  });
  const selected: LocalTarget = { repositoryId: repository.id, compare: 'uncommitted' };
  await service.startLocalReview(selected);
  await vi.waitFor(
    async () => {
      expect((await service.getLocalReviewStatus(selected)).state).toBe('done');
    },
    { timeout: 5000 },
  );
  expect(agent.run).toHaveBeenCalledOnce();
  expect(await fingerprint()).toEqual(before);
});
