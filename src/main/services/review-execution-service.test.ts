import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionRequest } from '@shared/review-execution';
import { shippingSimulation } from '@shared/simulation.fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewStore } from '../ai/review-store';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubConnections } from '../github/connections';
import { createReviewRuntime } from '../system/review-runtime';
import { createReviewExecutionService, parseTopLevelTests } from './review-execution-service';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const roots: string[] = [];
it('keeps skips and TODOs separate from passes and limits the summary to top-level TAP tests', () => {
  expect(
    parseTopLevelTests(
      'ok 1 - normal\nnot ok 2 - regression\nok 3 - ignored # SKIP\nnot ok 4 - future # TODO\n    ok 1 - nested',
    ),
  ).toEqual([
    { name: 'normal', status: 'passed' },
    { name: 'regression', status: 'failed' },
    { name: 'ignored', status: 'skipped' },
    { name: 'future', status: 'skipped' },
  ]);
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'plot-execute-test-'));
  roots.push(root);
  for (const side of ['before', 'after']) {
    await mkdir(join(root, side));
    await writeFile(
      join(root, side, 'shipping.mjs'),
      `export function shipping(amount) { if(typeof amount !== 'number' || ${side === 'before' ? 'amount < 0' : 'false'}) return {error:400}; return {fee: amount >= ${side === 'before' ? 50000 : 30000} ? 0 : 3000}; }`,
    );
  }
  await writeFile(
    join(root, 'after', 'shipping.test.mjs'),
    `import {test} from 'node:test'; import assert from 'node:assert/strict'; import {shipping} from './shipping.mjs'; test('negative amount is rejected',()=>assert.deepEqual(shipping(-1),{error:400}));`,
  );
  const simulation = shippingSimulation();
  simulation.inputs = simulation.inputs.filter((i) => i.id === 'amount');
  simulation.binding = {
    before: { path: 'shipping.mjs', exportName: 'shipping', args: [{ input: 'amount' }] },
    after: { path: 'shipping.mjs', exportName: 'shipping', args: [{ input: 'amount' }] },
  };
  const repositories = {
    fetchCommits: vi.fn(),
    listFiles: vi.fn().mockResolvedValue(['shipping.mjs', 'shipping.test.mjs']),
    checkoutDirectories: vi.fn(async (_r, commit, _dirs, target) =>
      cp(join(root, commit === head ? 'after' : 'before'), target, { recursive: true }),
    ),
    removeCheckout: vi.fn(async (_r, target) => rm(target, { recursive: true, force: true })),
    diff: vi
      .fn()
      .mockResolvedValue([{ path: 'shipping.test.mjs', newBlob: 'c'.repeat(40), kind: 'file' }]),
  } as unknown as RepositoryCache;
  const connections = {
    forHost: vi.fn().mockResolvedValue({
      client: {
        getPullRequest: vi.fn().mockResolvedValue({ head: { sha: head }, base: { sha: base } }),
        getMergeBase: vi.fn().mockResolvedValue(base),
      },
    }),
  } as unknown as GitHubConnections;
  const reviews = {
    read: vi.fn().mockResolvedValue({ review: { simulations: [simulation] } }),
  } as unknown as ReviewStore;
  const service = createReviewExecutionService({
    connections,
    repositories,
    reviews,
    runtime: createReviewRuntime(),
    root: join(root, 'work'),
    language: async () => 'ko',
  });
  const run = async (request: ExecutionRequest) => {
    await service.runReviewExecution(ref, request);
    await vi.waitFor(
      async () => expect((await service.getReviewExecution(ref)).task.state).not.toBe('running'),
      { timeout: 10000, interval: 25 },
    );
    const state = await service.getReviewExecution(ref);
    expect(state.task.state, JSON.stringify(state.task)).toBe('done');
    const report = state.reports.at(-1);
    if (!report) throw new Error('Missing execution report');
    return report;
  };
  return { service, run, repositories, root };
}
describe.skipIf(process.platform !== 'darwin')('version-bound real code comparison', () => {
  it('distinguishes actual exceptions, undefined returns and unsupported serialization', async () => {
    const { run, root } = await setup();
    for (const [body, kind, valueType] of [
      ['throw new TypeError("bad input")', 'throw', undefined],
      ['return 1n', 'setup-error', undefined],
      ['return NaN', 'setup-error', undefined],
      ['return undefined', 'return', 'undefined'],
    ] as const) {
      for (const side of ['before', 'after'])
        await writeFile(
          join(root, side, 'shipping.mjs'),
          `export function shipping() { ${body}; }`,
        );
      const report = await run({
        head,
        kind: 'scenario',
        simulationId: 'shipping',
        inputs: [{ id: 'amount', value: 1 }],
      });
      expect(report.after.outcome?.kind).toBe(kind);
      expect(report.after.outcome?.valueType).toBe(valueType);
      if (kind === 'setup-error') expect(report.after.status).toBe('failed');
    }
  }, 15000);
  it('uses stored function bindings and actual edited scalar values; returned errors are distinct from throws', async () => {
    const { run } = await setup();
    const boundary = await run({
      head,
      kind: 'scenario',
      simulationId: 'shipping',
      inputs: [{ id: 'amount', value: 40000 }],
    });
    expect(boundary.before.outcome).toEqual({ kind: 'return', value: { fee: 3000 } });
    expect(boundary.after.outcome).toEqual({ kind: 'return', value: { fee: 0 } });
    const invalid = await run({
      head,
      kind: 'scenario',
      simulationId: 'shipping',
      inputs: [{ id: 'amount', value: -1 }],
    });
    expect(invalid.before.outcome).toEqual({ kind: 'return', value: { error: 400 } });
    expect(invalid.after.outcome).toEqual({ kind: 'return', value: { fee: 3000 } });
  }, 15000);
  it('preserves missing framework errors instead of treating them as assertion evidence', async () => {
    const { run, root } = await setup();
    await writeFile(
      join(root, 'after', 'shipping.test.mjs'),
      "import { test } from 'vitest'; test('example', () => {});",
    );
    const report = await run({ head, kind: 'tests', paths: ['shipping.test.mjs'] });
    for (const side of [report.before, report.after]) {
      expect(side.status).toBe('failed');
      expect(`${side.stdout}\n${side.stderr}`).toContain('ERR_MODULE_NOT_FOUND');
      expect(`${side.stdout}\n${side.stderr}`).toContain('vitest');
      expect(side.tests?.some((test) => test.name === 'example')).toBe(false);
    }
  });
  it('runs new head test assertions against both snapshots and detects a removed guard', async () => {
    const { run } = await setup();
    const report = await run({ head, kind: 'tests', paths: ['shipping.test.mjs'] });
    expect(report.before.status, report.before.stderr).toBe('completed');
    expect(report.before.exitCode).toBe(0);
    expect(report.after.status).toBe('failed');
    expect(report.after.stdout).toContain('negative amount');
    expect(report.base).toBe(base);
    expect(report.head).toBe(head);
  }, 15000);
  it('rejects stale versions and unbound models before snapshot execution', async () => {
    const { service, repositories } = await setup();
    await expect(
      service.runReviewExecution(ref, { head: base, kind: 'tests', paths: ['shipping.test.mjs'] }),
    ).rejects.toThrow('PR changed');
    await expect(
      service.runReviewExecution(ref, {
        head,
        kind: 'scenario',
        simulationId: 'invented',
        inputs: [{ id: 'amount', value: 1 }],
      }),
    ).rejects.toThrow('no executable');
    expect(repositories.checkoutDirectories).not.toHaveBeenCalled();
  });
});
