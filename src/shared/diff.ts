export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';

export type FileKind = 'file' | 'symlink' | 'submodule';

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  kind: FileKind;
  oldBlob: string | null;
  newBlob: string | null;
  additions: number | null;
  deletions: number | null;
}

export interface PullRequestDiff {
  mergeBase: string;
  head: string;
  files: ChangedFile[];
}

export type BlobContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number };

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}
