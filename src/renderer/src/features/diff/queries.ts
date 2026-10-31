import type { BlobContent, ChangedFile } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import type { PlotApi } from '@shared/ipc';
import type { LocalDiff, LocalTarget } from '@shared/local';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { pullRequestKeys } from '../pull-request/queries';
import { type DiffTarget, localTargetOf } from './target';

const EMPTY: BlobContent = { kind: 'text', text: '' };

export const diffKeys = {
  diff: (ref: PullRequestRef) => [...pullRequestKeys.detail(ref), 'diff'] as const,
  blob: (ref: PullRequestRef, blob: string | null) =>
    ['blob', ref.owner.toLowerCase(), ref.repo.toLowerCase(), blob] as const,
  local: (repositoryId: string) => ['local', repositoryId] as const,
  localDiff: ({ repositoryId, compare }: LocalTarget) =>
    ['local', repositoryId, compare, 'diff'] as const,
};

export function usePullRequestDiff(ref: PullRequestRef) {
  const api = useApi();
  return useQuery({
    queryKey: diffKeys.diff(ref),
    queryFn: () => api.getPullRequestDiff(ref),
    staleTime: 60_000,
  });
}

export function useLocalDiff(target: LocalTarget) {
  const api = useApi();
  return useQuery<LocalDiff>({
    queryKey: diffKeys.localDiff(target),
    queryFn: () => api.getLocalDiff(target),
  });
}

export function useTargetDiff(target: DiffTarget) {
  const api = useApi();
  return useQuery<{ files: ChangedFile[] }>(
    target.kind === 'pull-request'
      ? {
          queryKey: diffKeys.diff(target.ref),
          queryFn: () => api.getPullRequestDiff(target.ref),
          staleTime: 60_000,
        }
      : {
          queryKey: diffKeys.localDiff(localTargetOf(target)),
          queryFn: () => api.getLocalDiff(localTargetOf(target)),
        },
  );
}

export type FileSide = 'original' | 'modified';

interface ContentQuery {
  queryKey: readonly unknown[];
  queryFn(): Promise<BlobContent>;
  staleTime: number;
}

export function useFileContent(target: DiffTarget, file: ChangedFile, side: FileSide) {
  const api = useApi();
  return useQuery(contentQuery(api, target, file, side));
}

function contentQuery(
  api: PlotApi,
  target: DiffTarget,
  file: ChangedFile,
  side: FileSide,
): ContentQuery {
  const submodule = file.kind === 'submodule';
  if (target.kind === 'pull-request') {
    const blob = submodule ? null : side === 'original' ? file.oldBlob : file.newBlob;
    return {
      queryKey: diffKeys.blob(target.ref, blob),
      queryFn: () => (blob ? api.readBlob(target.ref, blob) : Promise.resolve(EMPTY)),
      staleTime: Number.POSITIVE_INFINITY,
    };
  }
  const { repositoryId } = target;
  if (side === 'original') {
    const blob = submodule ? null : file.oldBlob;
    return {
      queryKey: [...diffKeys.local(repositoryId), 'blob', blob],
      queryFn: () => (blob ? api.readLocalBlob(repositoryId, blob) : Promise.resolve(EMPTY)),
      staleTime: Number.POSITIVE_INFINITY,
    };
  }
  // The working tree changes under us, so the current version is read again on every refresh.
  const missing = submodule || file.status === 'deleted';
  return {
    queryKey: [...diffKeys.local(repositoryId), 'file', file.path, missing],
    queryFn: () => (missing ? Promise.resolve(EMPTY) : api.readLocalFile(repositoryId, file.path)),
    staleTime: 0,
  };
}
