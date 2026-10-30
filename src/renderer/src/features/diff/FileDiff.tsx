import type { BlobContent, ChangedFile } from '@shared/diff';
import type { PullRequestRef } from '@shared/github';
import type { Ref } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { formatBytes } from '../../lib/format';
import {
  type ChangePosition,
  type DiffSettings,
  DiffViewer,
  type DiffViewerHandle,
} from './DiffViewer';
import { useBlob } from './queries';

interface FileDiffProps {
  target: PullRequestRef;
  file: ChangedFile;
  settings: DiffSettings;
  initialChange?: 'first' | 'last';
  onChangesComputed?(total: number): void;
  onReveal?(position: ChangePosition): void;
  viewerRef?: Ref<DiffViewerHandle>;
}

export function FileDiff({
  target,
  file,
  settings,
  initialChange,
  onChangesComputed,
  onReveal,
  viewerRef,
}: FileDiffProps) {
  const isSubmodule = file.kind === 'submodule';
  const original = useBlob(target, isSubmodule ? null : file.oldBlob);
  const modified = useBlob(target, isSubmodule ? null : file.newBlob);

  if (isSubmodule) {
    return (
      <StatusMessage title="Submodule changed">
        <code>{shortId(file.oldBlob)}</code> → <code>{shortId(file.newBlob)}</code>
      </StatusMessage>
    );
  }
  if (original.isError || modified.isError) {
    return (
      <StatusMessage
        title={`Could not load ${file.path}`}
        tone="error"
        onRetry={() => {
          void original.refetch();
          void modified.refetch();
        }}
      >
        {(original.error ?? modified.error)?.message}
      </StatusMessage>
    );
  }
  if (original.isPending || modified.isPending) {
    return <StatusMessage>Loading {file.path}…</StatusMessage>;
  }

  const contents = [original.data, modified.data];
  if (contents.some((content) => content.kind === 'binary')) {
    return (
      <StatusMessage title="Binary file">
        {sizeChange(original.data, modified.data)} Viewer does not show the contents of binary
        files.
      </StatusMessage>
    );
  }
  if (contents.some((content) => content.kind === 'too-large')) {
    return (
      <StatusMessage title="File too large to show">
        {sizeChange(original.data, modified.data)} Open it on GitHub to see the changes.
      </StatusMessage>
    );
  }

  return (
    <DiffViewer
      ref={viewerRef}
      path={file.path}
      original={textOf(original.data)}
      modified={textOf(modified.data)}
      settings={settings}
      initialChange={initialChange}
      onChangesComputed={onChangesComputed}
      onReveal={onReveal}
    />
  );
}

function textOf(content: BlobContent): string {
  return content.kind === 'text' ? content.text : '';
}

function sizeOf(content: BlobContent): number {
  return content.kind === 'text' ? new TextEncoder().encode(content.text).length : content.size;
}

function sizeChange(before: BlobContent, after: BlobContent): string {
  return `${formatBytes(sizeOf(before))} → ${formatBytes(sizeOf(after))}.`;
}

function shortId(objectId: string | null): string {
  return objectId ? objectId.slice(0, 7) : 'none';
}
