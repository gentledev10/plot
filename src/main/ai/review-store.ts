import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PullRequestRef } from '@shared/github';
import type { StoredReview } from '@shared/review';
import { parseReviewMap } from './review-schema';

// Raise this when the shape of a review changes, so older files are generated again.
const FORMAT = 2;

type StoredFile = StoredReview & { format: number };

export interface ReviewStore {
  read(ref: PullRequestRef, head: string): Promise<StoredReview | undefined>;
  write(ref: PullRequestRef, stored: StoredReview): Promise<void>;
}

export function createFileReviewStore(rootDir: string): ReviewStore {
  function fileFor(ref: PullRequestRef, head: string): string {
    return join(
      rootDir,
      ref.host,
      ref.owner.toLowerCase(),
      ref.repo.toLowerCase(),
      `${ref.number}-${head}.json`,
    );
  }

  return {
    async read(ref, head) {
      try {
        const stored = JSON.parse(await readFile(fileFor(ref, head), 'utf8')) as StoredFile;
        if (
          stored.format !== FORMAT ||
          stored.head !== head ||
          typeof stored.createdAt !== 'string'
        ) {
          return undefined;
        }
        const { format: _format, ...review } = stored;
        return { ...review, review: parseReviewMap(stored.review) };
      } catch {
        return undefined;
      }
    },

    async write(ref, stored) {
      const file = fileFor(ref, stored.head);
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({ format: FORMAT, ...stored } satisfies StoredFile),
      );
      await rename(temporary, file);
    },
  };
}
