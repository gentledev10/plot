import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import { AppError } from '../errors';
import { isolatedGitEnvironment } from '../git/environment';
import { runCommand } from '../system/process';
import { CONTEXT_FILES } from './review-prompt';

interface ContextOptions {
  root: string;
  files: readonly ChangedFile[];
  readBefore(file: ChangedFile): Promise<BlobContent>;
  readAfter(file: ChangedFile): Promise<BlobContent>;
  signal: AbortSignal;
}

export const LOCAL_REVIEW_LIMITS = {
  files: 300,
  fileBytes: 4 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
} as const;

export function validateLocalReviewFiles(files: readonly ChangedFile[]) {
  const paths = files.flatMap((file) => [
    file.path,
    ...(file.previousPath ? [file.previousPath] : []),
  ]);
  if (
    files.length > LOCAL_REVIEW_LIMITS.files ||
    paths.some(
      (path) =>
        !path ||
        path.length > 1024 ||
        [...path].some(
          (char) => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ) ||
        posix.isAbsolute(path) ||
        path
          .split('/')
          .some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git'),
    ) ||
    files.some((file) => file.kind !== 'file')
  ) {
    throw new AppError(
      'ai-failed',
      'The selected diff contains unsafe paths, symbolic links, submodules, or too many files.',
    );
  }
}

export async function createLocalReviewContext(options: ContextOptions) {
  let bytes = 0;
  validateLocalReviewFiles(options.files);
  const textOf = (content: BlobContent) => {
    if (content.kind !== 'text')
      throw new AppError(
        'ai-failed',
        'Local AI overviews require bounded text files; binary or oversized files are not supported.',
      );
    const size = Buffer.byteLength(content.text);
    bytes += size;
    if (size > LOCAL_REVIEW_LIMITS.fileBytes || bytes > LOCAL_REVIEW_LIMITS.totalBytes)
      throw new AppError(
        'ai-failed',
        'The selected local diff exceeds the AI snapshot size limit.',
      );
    return content.text;
  };
  await mkdir(options.root, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(join(options.root, 'local-'));
  const cwd = join(workspace, 'repo');
  const contextDir = join(workspace, 'context');
  const dispose = () => rm(workspace, { recursive: true, force: true });
  const lines = new Map<string, number>();
  const checkpoint = () => {
    if (options.signal.aborted)
      throw new AppError('ai-cancelled', 'The local AI overview was cancelled.');
  };
  const git = async (...args: string[]) => {
    checkpoint();
    return (
      await runCommand(
        'git',
        ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args],
        {
          cwd,
          env: isolatedGitEnvironment(
            Object.fromEntries(
              Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
            ),
          ),
          maxBufferBytes: 8 * 1024 * 1024,
          timeoutMs: 30_000,
        },
      )
    ).stdout;
  };
  try {
    await mkdir(cwd, { mode: 0o700 });
    await mkdir(contextDir, { mode: 0o700 });
    await git('init', '--template=', '--quiet');
    const indexPath = async (path: string) => {
      const oid = (await git('hash-object', '-w', '--no-filters', '--', path)).trim();
      await git('update-index', '--add', '--cacheinfo', '100644', oid, path);
    };
    for (const file of options.files) {
      const path = file.previousPath ?? file.path;
      if (file.oldBlob) {
        const content = await options.readBefore(file);
        const target = join(cwd, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, textOf(content));
        await indexPath(path);
      }
    }
    const before = (await git('write-tree')).trim();
    await git('read-tree', '--empty');
    for (const file of options.files)
      await rm(join(cwd, file.previousPath ?? file.path), { recursive: true, force: true });
    for (const file of options.files) {
      if (file.status !== 'deleted') {
        const content = await options.readAfter(file);
        const target = join(cwd, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, textOf(content));
        await indexPath(file.path);
        if (content.kind === 'text') lines.set(file.path, content.text.split('\n').length);
      }
    }
    const after = (await git('write-tree')).trim();
    await writeFile(
      join(contextDir, CONTEXT_FILES.diff),
      await git('diff', '--text', '--no-ext-diff', '--no-textconv', before, after, '--'),
    );
    await writeFile(
      join(contextDir, CONTEXT_FILES.files),
      options.files
        .filter((file) => file.status !== 'deleted')
        .map((file) => file.path)
        .join('\n'),
    );
    await writeFile(
      join(contextDir, CONTEXT_FILES.description),
      '# Local changes\nOnly the selected local diff and selected file snapshots are available. No pull request or author description exists. Broader repository context was not inspected.\n',
    );
    await writeFile(
      join(contextDir, CONTEXT_FILES.architecture),
      JSON.stringify({ files: [], omitted: ['Unselected repository context is not included.'] }),
    );
    checkpoint();
    return { cwd, contextDir, lines, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
