import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { LocalRepository } from '@shared/local';
import { AppError } from '../errors';

const MAX_RECENT = 20;

export interface LocalRepositoryStore {
  list(): Promise<LocalRepository[]>;
  add(path: string): Promise<LocalRepository>;
  remove(id: string): Promise<void>;
  root(id: string): Promise<string>;
}

export function localRepositoryId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

export function createLocalRepositoryStore(file: string): LocalRepositoryStore {
  let loading: Promise<LocalRepository[]> | undefined;

  function load(): Promise<LocalRepository[]> {
    loading ??= readFile(file, 'utf8')
      .then((text) => parse(JSON.parse(text)))
      .catch(() => []);
    return loading;
  }

  async function save(repositories: LocalRepository[]): Promise<void> {
    loading = Promise.resolve(repositories);
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(repositories, null, 2));
    await rename(temporary, file);
  }

  return {
    list: load,

    async add(path) {
      const repository = { id: localRepositoryId(path), name: basename(path), path };
      const others = (await load()).filter((candidate) => candidate.id !== repository.id);
      await save([repository, ...others].slice(0, MAX_RECENT));
      return repository;
    },

    async remove(id) {
      await save((await load()).filter((candidate) => candidate.id !== id));
    },

    async root(id) {
      const repository = (await load()).find((candidate) => candidate.id === id);
      if (!repository) {
        throw new AppError('invalid-argument', 'That repository is no longer in the list.');
      }
      return repository.path;
    },
  };
}

function parse(value: unknown): LocalRepository[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const { path } = item as Record<string, unknown>;
    return typeof path === 'string' && path.startsWith('/')
      ? [{ id: localRepositoryId(path), name: basename(path), path }]
      : [];
  });
}
