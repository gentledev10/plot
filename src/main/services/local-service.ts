import type { PlotApi } from '@shared/ipc';
import type { LocalGit } from '../local/local-git';
import type { LocalRepositoryStore } from '../local/local-repositories';

export const MAX_LOCAL_FILE_BYTES = 4 * 1024 * 1024;

export type LocalService = Pick<
  PlotApi,
  | 'openLocalRepository'
  | 'listLocalRepositories'
  | 'removeLocalRepository'
  | 'getLocalDiff'
  | 'getLocalSignature'
  | 'readLocalBlob'
  | 'readLocalFile'
>;

interface LocalServiceOptions {
  repositories: LocalRepositoryStore;
  git: LocalGit;
  chooseFolder(): Promise<string | undefined>;
}

export function createLocalService({
  repositories,
  git,
  chooseFolder,
}: LocalServiceOptions): LocalService {
  return {
    async openLocalRepository() {
      const folder = await chooseFolder();
      if (!folder) {
        return null;
      }
      return repositories.add(await git.topLevel(folder));
    },

    listLocalRepositories() {
      return repositories.list();
    },

    removeLocalRepository(id) {
      return repositories.remove(id);
    },

    async getLocalDiff({ repositoryId, compare }) {
      return git.diff(await repositories.root(repositoryId), compare);
    },

    async getLocalSignature({ repositoryId, compare }) {
      return git.signature(await repositories.root(repositoryId), compare);
    },

    async readLocalBlob(repositoryId, blob) {
      return git.readBlob(await repositories.root(repositoryId), blob, MAX_LOCAL_FILE_BYTES);
    },

    async readLocalFile(repositoryId, path) {
      return git.readFile(await repositories.root(repositoryId), path, MAX_LOCAL_FILE_BYTES);
    },
  };
}
