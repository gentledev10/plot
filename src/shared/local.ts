import type { ChangedFile } from './diff';

export const LOCAL_COMPARES = ['uncommitted', 'commits'] as const;

export type LocalCompare = (typeof LOCAL_COMPARES)[number];

export interface LocalRepository {
  id: string;
  name: string;
  path: string;
}

export interface LocalTarget {
  repositoryId: string;
  compare: LocalCompare;
  // Selects commit history only; it never changes the comparison baseline.
  headRef?: string;
  commits?: string[];
}

export interface LocalBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

export interface LocalCommit {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
}

export interface LocalHistory {
  branches: LocalBranch[];
  commits: LocalCommit[];
  hasMore: boolean;
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

export const MAX_LOCAL_COMMITS = 100;

export function isLocalRef(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.startsWith('-') &&
    !/[\s\p{Cc}~^:?*[\\]/u.test(value) &&
    !value.includes('..') &&
    !value.includes('@{') &&
    value !== '@' &&
    value
      .split('/')
      .every(
        (part) =>
          part.length > 0 &&
          !part.startsWith('.') &&
          !part.endsWith('.') &&
          !part.endsWith('.lock'),
      )
  );
}

const REPOSITORY_ID = /^[0-9a-f]{16}$/;

export function isLocalRepositoryId(value: unknown): value is string {
  return typeof value === 'string' && REPOSITORY_ID.test(value);
}

export function isLocalCompare(value: unknown): value is LocalCompare {
  return typeof value === 'string' && (LOCAL_COMPARES as readonly string[]).includes(value);
}
