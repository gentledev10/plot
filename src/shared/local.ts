import type { ChangedFile } from './diff';

export const LOCAL_COMPARES = ['branch', 'uncommitted'] as const;

export type LocalCompare = (typeof LOCAL_COMPARES)[number];

export interface LocalRepository {
  id: string;
  name: string;
  path: string;
}

export interface LocalTarget {
  repositoryId: string;
  compare: LocalCompare;
}

export interface LocalStatus {
  branch: string | null;
  changedFiles: number;
}

export interface LocalDiff {
  branch: string | null;
  base: { name: string; commit: string } | null;
  files: ChangedFile[];
}

const REPOSITORY_ID = /^[0-9a-f]{16}$/;

export function isLocalRepositoryId(value: unknown): value is string {
  return typeof value === 'string' && REPOSITORY_ID.test(value);
}

export function isLocalCompare(value: unknown): value is LocalCompare {
  return typeof value === 'string' && (LOCAL_COMPARES as readonly string[]).includes(value);
}
