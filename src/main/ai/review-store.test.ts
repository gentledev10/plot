import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StoredReview } from '@shared/review';
import { shippingSimulation } from '@shared/simulation.fixture';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileReviewStore } from './review-store';

const ref = { host: 'github.com', owner: 'OctoCat', repo: 'Hello-World', number: 42 };
const head = 'b'.repeat(40);

const stored: StoredReview = {
  head,
  createdAt: '2026-10-31T00:00:00.000Z',
  costUsd: 0.3,
  review: {
    summary: 'Adds dark mode.',
    changes: [],
    flows: [],
    architecture: { nodes: [], edges: [] },
    impacts: [],
    readingOrder: [],
  },
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plot-reviews-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createFileReviewStore', () => {
  it('retains interactive programs and typed failure cases when a saved review is reopened', async () => {
    const store = createFileReviewStore(root);
    const simulation = shippingSimulation();
    await store.write(ref, {
      ...stored,
      review: {
        ...stored.review,
        changes: [
          { title: simulation.changeTitle, before: 'Old threshold', after: 'New threshold' },
        ],
        simulations: [simulation],
      },
    });
    const saved = (await store.read(ref, head))?.review.simulations?.[0];
    expect(saved?.cases).toEqual(simulation.cases);
    expect(saved?.before.nodes[0]).not.toHaveProperty('location');
    expect(saved?.after.nodes).toEqual(simulation.after.nodes);
  });
  it('keeps English and Korean reviews for the same commit without overwriting either', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, { ...stored, language: 'en' });
    await store.write(ref, {
      ...stored,
      language: 'ko',
      review: { ...stored.review, summary: '한국어 설명' },
    });
    expect((await store.read(ref, head, 'en'))?.review.summary).toBe(stored.review.summary);
    expect((await store.read(ref, head, 'ko'))?.review.summary).toBe('한국어 설명');
    expect(await store.read(ref, head)).toBeUndefined();
  });

  it('does not serve an old review of unknown language for a requested language', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    expect(await store.read(ref, head, 'ko')).toBeUndefined();
    expect(await store.read(ref, head)).toEqual(stored);
  });
  it('reads back what it wrote for the same head commit', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    await expect(store.read(ref, head)).resolves.toEqual(stored);
  });

  it('keeps one file per pull request and head, ignoring name case', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    await expect(readdir(join(root, 'github.com', 'octocat', 'hello-world'))).resolves.toEqual([
      `42-${head}.json`,
    ]);
    await expect(store.read({ ...ref, owner: 'octocat' }, head)).resolves.toEqual(stored);
  });

  it('returns nothing for another head commit, so new pushes get a new review', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    await expect(store.read(ref, 'c'.repeat(40))).resolves.toBeUndefined();
  });

  it('ignores reviews saved in an older format, so they are generated again', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    const file = join(root, 'github.com', 'octocat', 'hello-world', `42-${head}.json`);
    const { format: _format, ...older } = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify(older));

    await expect(store.read(ref, head)).resolves.toBeUndefined();
  });

  it('ignores corrupted files', async () => {
    const store = createFileReviewStore(root);
    await store.write(ref, stored);
    await writeFile(join(root, 'github.com', 'octocat', 'hello-world', `42-${head}.json`), '{oops');
    await expect(store.read(ref, head)).resolves.toBeUndefined();
  });
});
