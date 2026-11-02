import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PullRequestRef } from '@shared/github';
import type { Language } from '@shared/language';
import type { StoredReviewActivity } from '@shared/review-activity';

export interface ReviewActivityStore {
  read(ref: PullRequestRef, head: string, language: Language): Promise<StoredReviewActivity>;
  update(
    ref: PullRequestRef,
    head: string,
    language: Language,
    update: (current: StoredReviewActivity) => StoredReviewActivity,
  ): Promise<void>;
}
export function createReviewActivityStore(root: string): ReviewActivityStore {
  const queues = new Map<string, Promise<unknown>>();
  const path = (ref: PullRequestRef, head: string, language: Language) =>
    join(
      root,
      ref.host,
      ref.owner.toLowerCase(),
      ref.repo.toLowerCase(),
      `${ref.number}-${head}-${language}.json`,
    );
  const read = async (
    ref: PullRequestRef,
    head: string,
    language: Language,
  ): Promise<StoredReviewActivity> => {
    try {
      const stored = JSON.parse(await readFile(path(ref, head, language), 'utf8'));
      return stored.head === head &&
        stored.language === language &&
        Array.isArray(stored.data?.questions)
        ? stored.data
        : { questions: [] };
    } catch {
      return { questions: [] };
    }
  };
  return {
    read,
    async update(ref, head, language, update) {
      const file = path(ref, head, language);
      const task = (queues.get(file) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const data = update(await read(ref, head, language));
          data.questions = data.questions.slice(-30);
          await mkdir(dirname(file), { recursive: true });
          const temporary = `${file}.${process.pid}.tmp`;
          await writeFile(temporary, JSON.stringify({ head, language, data }), { mode: 0o600 });
          await rename(temporary, file);
        });
      queues.set(file, task);
      await task;
    },
  };
}
