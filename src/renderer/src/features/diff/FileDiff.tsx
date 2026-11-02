import type { BlobContent, ChangedFile } from '@shared/diff';
import type { ReviewCodeSelection, ReviewRange } from '@shared/review-unit';
import { lazy, type Ref, Suspense } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { formatBytes } from '../../lib/format';
import { useT } from '../language/LanguageProvider';
import type { ChangePosition, DiffSettings, DiffViewerHandle, LineRequest } from './DiffViewer';
import { useFileContent } from './queries';
import type { DiffTarget } from './target';

const DiffViewer = lazy(() =>
  import('./DiffViewer').then((module) => ({
    default: module.DiffViewer,
  })),
);
interface FileDiffProps {
  target: DiffTarget;
  file: ChangedFile;
  settings: DiffSettings;
  initialChange?: 'first' | 'last';
  revealLine?: LineRequest;
  onChangesComputed?(total: number): void;
  onReveal?(position: ChangePosition): void;
  viewerRef?: Ref<DiffViewerHandle>;
  focusRanges?: { original: ReviewRange[]; modified: ReviewRange[] };
  onCodeSelection?(selection: ReviewCodeSelection | undefined): void;
}
export function FileDiff({
  target,
  file,
  settings,
  initialChange,
  revealLine,
  onChangesComputed,
  onReveal,
  viewerRef,
  focusRanges,
  onCodeSelection,
}: FileDiffProps) {
  const t = useT();
  const isSubmodule = file.kind === 'submodule';
  const original = useFileContent(target, file, 'original');
  const modified = useFileContent(target, file, 'modified');
  if (isSubmodule) {
    return (
      <StatusMessage title={t('Submodule changed')}>
        <code>{shortId(file.oldBlob)}</code> → <code>{shortId(file.newBlob)}</code>
      </StatusMessage>
    );
  }
  if (original.isError || modified.isError) {
    return (
      <StatusMessage
        title={t('Could not load {value0}', {
          value0: file.path,
        })}
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
    return (
      <StatusMessage>
        {t('Loading ')}
        {file.path}…
      </StatusMessage>
    );
  }
  const contents = [original.data, modified.data];
  if (contents.some((content) => content.kind === 'binary')) {
    return (
      <StatusMessage title={t('Binary file')}>
        {sizeChange(original.data, modified.data)}
        {t(' Plot does not show the contents of binary files.')}
      </StatusMessage>
    );
  }
  if (contents.some((content) => content.kind === 'too-large')) {
    return (
      <StatusMessage title={t('File too large to show')}>
        {sizeChange(original.data, modified.data)}{' '}
        {target.kind === 'pull-request'
          ? t('Open it on GitHub to see the changes.')
          : t('Open it in your editor to see the changes.')}
      </StatusMessage>
    );
  }
  return (
    <Suspense fallback={<StatusMessage>{t('Loading the editor…')}</StatusMessage>}>
      <DiffViewer
        ref={viewerRef}
        path={file.path}
        original={textOf(original.data)}
        modified={textOf(modified.data)}
        settings={settings}
        initialChange={initialChange}
        revealLine={revealLine}
        onChangesComputed={onChangesComputed}
        onReveal={onReveal}
        focusRanges={focusRanges}
        onCodeSelection={onCodeSelection}
      />
    </Suspense>
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
