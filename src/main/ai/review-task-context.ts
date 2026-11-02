import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ChangedFile } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import type { ReviewMap } from '@shared/review';
import type { ReviewCodeSelection } from '@shared/review-unit';
import { AppError } from '../errors';
import type { RepositoryCache } from '../git/repository-cache';

export interface ReviewTaskContext {
  repoDir: string;
  contextDir: string;
  lines: Map<string, number>;
  providedPaths: string[];
  omittedPaths: string[];
  diffTruncated: boolean;
  dispose(): Promise<void>;
}
export async function prepareReviewTaskContext({
  ref,
  head,
  base,
  files,
  review,
  unitId,
  selection,
  title,
  body,
  root,
  repositories,
  signal,
}: {
  ref: PullRequestRef;
  head: string;
  base: string;
  files: ChangedFile[];
  review?: ReviewMap;
  unitId?: string;
  selection?: ReviewCodeSelection;
  title: string;
  body: string;
  root: string;
  repositories: RepositoryCache;
  signal: AbortSignal;
}): Promise<ReviewTaskContext> {
  const unit = unitId ? review?.units?.find((unit) => unit.id === unitId) : undefined;
  if (unitId && !unit)
    throw new AppError('invalid-argument', 'That reading unit is not in the saved review.');
  const selectedFile = selection ? files.find((file) => file.path === selection.path) : undefined;
  if (selection && !selectedFile)
    throw new AppError('invalid-argument', 'Select code from a changed file.');
  const requested = [
    ...new Set([
      ...(selection ? [selection.path] : []),
      ...(unit?.files.map((file) => file.path) ?? files.map((file) => file.path)),
    ]),
  ];
  const selectedPaths = requested.slice(0, 16);
  const directory = join(root, randomUUID());
  const repoDir = join(directory, 'repo');
  const contextDir = join(directory, 'context');
  const dispose = async () => {
    await repositories.removeCheckout(ref, repoDir);
    await rm(directory, { recursive: true, force: true });
  };
  const checkpoint = () => {
    if (signal.aborted) throw new AppError('ai-cancelled', 'The AI review was cancelled.');
  };
  try {
    checkpoint();
    await mkdir(contextDir, { recursive: true });
    await repositories.checkoutDirectories(
      ref,
      head,
      [...new Set(selectedPaths.map((path) => dirname(path)).filter((dir) => dir !== '.'))],
      repoDir,
    );
    const sources: { path: string; original: string; modified: string }[] = [];
    const lines = new Map<string, number>();
    let total = 0;
    for (const path of selectedPaths) {
      checkpoint();
      const file = files.find((file) => file.path === path);
      if (file?.kind !== 'file' || total >= 180_000) continue;
      const read = async (blob: string | null) =>
        blob ? repositories.readBlob(ref, blob, 48_000) : { kind: 'text' as const, text: '' };
      const [original, modified] = await Promise.all([read(file.oldBlob), read(file.newBlob)]);
      if (original.kind !== 'text' || modified.kind !== 'text') continue;
      if (total + original.text.length + modified.text.length > 180_000) continue;
      total += original.text.length + modified.text.length;
      sources.push({ path, original: original.text, modified: modified.text });
      lines.set(
        path,
        modified.text ? modified.text.split('\n').length - Number(modified.text.endsWith('\n')) : 0,
      );
    }
    let selectedCode:
      | { path: string; side: string; startLine: number; endLine: number; text: string }
      | undefined;
    if (selection) {
      const source = sources.find((source) => source.path === selection.path);
      if (!source)
        throw new AppError(
          'invalid-argument',
          'The selected code is binary or too large for a question.',
        );
      const text = source[selection.side];
      const sourceLines = text.split('\n');
      const count = text ? sourceLines.length - Number(text.endsWith('\n')) : 0;
      if (selection.endLine > count)
        throw new AppError('invalid-argument', 'The selected lines do not exist in this revision.');
      selectedCode = {
        ...selection,
        text: sourceLines
          .slice(selection.startLine - 1, selection.endLine)
          .join('\n')
          .slice(0, 24000),
      };
    }
    if (!sources.length)
      throw new AppError(
        'invalid-argument',
        'There is no text source within the review context limit.',
      );
    const patch = await repositories.unifiedDiff(ref, base, head, selectedPaths);
    const providedPaths = sources.map((source) => source.path);
    const omittedPaths = files
      .filter((file) => !providedPaths.includes(file.path))
      .map((file) => file.path);
    const diffTruncated = patch.length > 250_000 || requested.length > selectedPaths.length;
    await writeFile(
      join(contextDir, 'task-context.json'),
      JSON.stringify({
        head,
        base,
        title,
        description: body.slice(0, 24000),
        unit,
        selectedCode,
        sources,
        providedPaths,
        omittedPaths,
        diffTruncated,
        reviewSummary: review?.summary ?? '',
      }),
    );
    await writeFile(join(contextDir, 'changes.diff'), patch.slice(0, 250_000));
    checkpoint();
    return { repoDir, contextDir, lines, providedPaths, omittedPaths, diffTruncated, dispose };
  } catch (error) {
    await dispose().catch(() => {});
    throw error;
  }
}
