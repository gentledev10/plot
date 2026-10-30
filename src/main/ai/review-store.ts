import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PullRequestRef } from '@shared/github';
import type { StoredReview } from '@shared/review';
import { parseReviewMap } from './review-schema';

export interface ReviewStore {
  read(ref: PullRequestRef, head: string): Promise<StoredReview | undefined>;
  write(ref: PullRequestRef, stored: StoredReview): Promise<void>;
}

export function createFileReviewStore(rootDir: string): ReviewStore {
  function fileFor(ref: PullRequestRef, head: string): string {
    return join(
      rootDir,
      ref.owner.toLowerCase(),
      ref.repo.toLowerCase(),
      `${ref.number}-${head}.json`,
    );
  }

  return {
    async read(ref, head) {
      try {
        const stored = JSON.parse(await readFile(fileFor(ref, head), 'utf8')) as StoredReview;
        if (stored.head !== head || typeof stored.createdAt !== 'string') {
          return undefined;
        }
        return { ...stored, review: parseReviewMap(stored.review) };
      } catch {
        return undefined;
      }
    },

    async write(ref, stored) {
      const file = fileFor(ref, stored.head);
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(stored));
      await rename(temporary, file);
    },
  };
}
