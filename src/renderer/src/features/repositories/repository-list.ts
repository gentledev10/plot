import type { RepositoryRef } from '@shared/github';
import {
  formatRepositoryRef,
  isRepositoryRef,
  isSameRepository,
  parseRepositoryRef,
} from '@shared/repository-ref';

const SUGGESTION_LIMIT = 8;

export const REPOSITORY_LIST_PREFERENCE = 'pullRequests.repositories';

export function parseRepositoryList(stored: unknown): RepositoryRef[] | undefined {
  if (!Array.isArray(stored)) {
    return undefined;
  }
  const list: RepositoryRef[] = [];
  for (const item of stored) {
    if (isRepositoryRef(item) && !hasRepository(list, item)) {
      list.push({ host: item.host, owner: item.owner, repo: item.repo });
    }
  }
  return list;
}

export function hasRepository(list: readonly RepositoryRef[], ref: RepositoryRef): boolean {
  return list.some((item) => isSameRepository(item, ref));
}

export function addRepository(list: readonly RepositoryRef[], ref: RepositoryRef): RepositoryRef[] {
  return hasRepository(list, ref) ? [...list] : [...list, ref];
}

export function removeRepository(
  list: readonly RepositoryRef[],
  ref: RepositoryRef,
): RepositoryRef[] {
  return list.filter((item) => !isSameRepository(item, ref));
}

export function matchesRepository(ref: RepositoryRef, query: string): boolean {
  const name = formatRepositoryRef(ref).toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => name.includes(word));
}

export interface RepositoryOptions {
  typed?: RepositoryRef;
  suggestions: RepositoryRef[];
}

export function repositoryOptions(
  text: string,
  choices: readonly RepositoryRef[],
  defaultHost: string,
): RepositoryOptions {
  const typed = parseRepositoryRef(text, defaultHost);
  const suggestions = choices
    .filter((choice) => matchesRepository(choice, text))
    .slice(0, SUGGESTION_LIMIT);
  return typed && !hasRepository(suggestions, typed) ? { typed, suggestions } : { suggestions };
}
