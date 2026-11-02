import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReviewAnswer, ReviewVerification } from '@shared/review-activity';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createReviewActivityStore } from './review-activity-store';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plot-thread-store-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it('serializes parallel question/check updates and separates revisions and languages', async () => {
  const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
  const head = 'a'.repeat(40);
  const store = createReviewActivityStore(root);
  const scope = {
    head,
    createdAt: new Date().toISOString(),
    providedPaths: [],
    omittedPaths: [],
    diffTruncated: false,
    provider: 'codex' as const,
  };
  const answer: ReviewAnswer = {
    ...scope,
    id: 'q',
    question: 'Why?',
    answer: 'Because.',
    locations: [],
  };
  const report: ReviewVerification = { ...scope, summary: 'Checked.', findings: [] };
  await Promise.all([
    store.update(ref, head, 'ko', (data) => ({ ...data, questions: [...data.questions, answer] })),
    store.update(ref, head, 'ko', (data) => ({ ...data, verifications: [report] })),
  ]);
  expect(await store.read(ref, head, 'ko')).toEqual({
    questions: [answer],
    verifications: [report],
  });
  expect(await store.read(ref, head, 'en')).toEqual({ questions: [] });
  expect(await store.read(ref, 'b'.repeat(40), 'ko')).toEqual({ questions: [] });
});
