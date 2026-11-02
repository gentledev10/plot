import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewAgent } from '../ai/agent';
import { createReviewActivityStore } from '../ai/review-activity-store';
import { createFileReviewStore } from '../ai/review-store';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubConnections } from '../github/connections';
import { createReviewActivityService } from './review-activity-service';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plot-activity-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const head = 'a'.repeat(40);
function setup(run: ReviewAgent['run']) {
  const repositories = {
    fetchCommits: vi.fn().mockResolvedValue(undefined),
    diff: vi.fn().mockResolvedValue([
      {
        path: 'src/main.ts',
        status: 'modified',
        kind: 'file',
        oldBlob: 'b'.repeat(40),
        newBlob: 'c'.repeat(40),
        additions: 1,
        deletions: 1,
      },
    ]),
    checkoutDirectories: vi.fn(async (_ref, _head, _dirs, target) => {
      await mkdir(target, { recursive: true });
    }),
    readBlob: vi.fn().mockResolvedValue({ kind: 'text', text: 'line one\nline two\nline three\n' }),
    unifiedDiff: vi.fn().mockResolvedValue('a bounded diff'),
    removeCheckout: vi.fn().mockResolvedValue(undefined),
  } as unknown as RepositoryCache;
  const connections = {
    forHost: vi.fn().mockResolvedValue({
      client: {
        getPullRequest: vi.fn().mockResolvedValue({
          title: 'Fix a condition',
          body: 'Review this.',
          head: { sha: head },
          base: { sha: 'd'.repeat(40) },
        }),
        getMergeBase: vi.fn().mockResolvedValue('d'.repeat(40)),
      },
    }),
  } as unknown as GitHubConnections;
  const store = createReviewActivityStore(join(root, 'activity'));
  const options = {
    repositories,
    connections,
    store,
    reviews: createFileReviewStore(join(root, 'reviews')),
    workspaceRoot: join(root, 'workspaces'),
    language: async () => 'ko' as const,
    resolveAgent: async () => ({
      provider: 'codex' as const,
      model: 'test-model',
      apiKey: 'do-not-store-this',
      agent: { run },
    }),
  };
  return { service: createReviewActivityService(options), options, repositories, store };
}

describe('review questions and independent checks', () => {
  it('reads actual selected source, rejects forged citations, and persists revision-bound questions', async () => {
    const run = vi.fn<ReviewAgent['run']>(async (input) => {
      const packet = JSON.parse(
        await readFile(join(input.contextDir, 'task-context.json'), 'utf8'),
      );
      expect(packet.selectedCode.text).toBe('line two');
      expect(input.prompt).toContain('Do not write files');
      return {
        output: {
          answer: 'The condition changes this path.',
          locations: [
            { path: 'src/main.ts', line: 2 },
            { path: '../secret', line: 1 },
            { path: 'src/main.ts', line: 99 },
          ],
        },
      };
    });
    const { service, options, repositories } = setup(run);
    await service.askReview(ref, {
      head,
      question: 'Why does this branch change?',
      selection: { path: 'src/main.ts', side: 'original', startLine: 2, endLine: 2 },
    });
    await vi.waitFor(async () =>
      expect((await service.getReviewActivity(ref)).questionTask.state).toBe('done'),
    );
    const state = await createReviewActivityService(options).getReviewActivity(ref);
    expect(state.questions[0]?.locations).toEqual([
      { path: 'src/main.ts', line: 2, verified: true },
    ]);
    expect(state.questions[0]?.providedPaths).toEqual(['src/main.ts']);
    expect(JSON.stringify(state)).not.toContain('do-not-store-this');
    expect(repositories.removeCheckout).toHaveBeenCalledOnce();
  });
  it('uses separate sessions and preserves a dismissed finding', async () => {
    const run = vi
      .fn<ReviewAgent['run']>()
      .mockResolvedValueOnce({
        output: {
          summary: 'One candidate.',
          findings: [
            {
              id: 'f1',
              title: 'Missing guard',
              severity: 'high',
              reason: 'Input might be empty.',
              check: 'Read the guard.',
              location: { path: 'src/main.ts', line: 2 },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        output: {
          findings: [
            { id: 'f1', verdict: 'dismissed', reason: 'The caller already guards this input.' },
          ],
        },
      });
    const { service } = setup(run);
    await service.verifyReview(ref, { head });
    await vi.waitFor(async () =>
      expect((await service.getReviewActivity(ref)).verificationTask.state).toBe('done'),
    );
    const state = await service.getReviewActivity(ref);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0].prompt).toContain('Re-read the cited implementation');
    expect(state.verifications[0]?.findings[0]).toMatchObject({
      verdict: 'dismissed',
      verificationReason: 'The caller already guards this input.',
    });
  });
  it.each([{ unexpected: true }, { summary: 'Check complete', findings: [null] }])(
    'never labels malformed output as a successful check with no findings: %j',
    async (output) => {
      const { service } = setup(vi.fn().mockResolvedValue({ output }));
      await service.verifyReview(ref, { head });
      await vi.waitFor(async () =>
        expect((await service.getReviewActivity(ref)).verificationTask.state).toBe('failed'),
      );
      expect((await service.getReviewActivity(ref)).verifications).toEqual([]);
    },
  );
  it('rejects outdated revisions before starting an AI request', async () => {
    const run = vi.fn();
    const { service } = setup(run);
    await expect(
      service.askReview(ref, { head: 'f'.repeat(40), question: 'Explain' }),
    ).rejects.toThrow('The PR changed');
    expect(run).not.toHaveBeenCalled();
  });
  it('cancels an active question without saving a partial answer', async () => {
    const run = vi.fn<ReviewAgent['run']>(
      (input) =>
        new Promise((_, reject) =>
          input.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        ),
    );
    const { service } = setup(run);
    await service.askReview(ref, { head, question: 'Explain' });
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    await service.cancelReviewActivity(ref, 'question');
    await vi.waitFor(async () =>
      expect((await service.getReviewActivity(ref)).questionTask.state).toBe('idle'),
    );
    expect((await service.getReviewActivity(ref)).questions).toEqual([]);
  });
});
