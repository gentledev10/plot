import type { PullRequestRef } from '@shared/github';
import { useMemo, useRef, useState } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { usePreference } from '../../lib/preferences';
import { useShortcuts } from '../../lib/shortcuts';
import type { Direction } from '../diff/changes';
import { DiffToolbar } from '../diff/DiffToolbar';
import type { ChangePosition, DiffSettings, DiffViewerHandle } from '../diff/DiffViewer';
import { FileDiff } from '../diff/FileDiff';
import { usePullRequestDiff } from '../diff/queries';
import { buildFileTree, filesInTreeOrder } from '../files/file-tree';
import { adjacentFile, decideNavigation } from './navigation';
import { PullRequestHeader } from './PullRequestHeader';
import styles from './PullRequestWorkspace.module.css';

interface PullRequestWorkspaceProps {
  target: PullRequestRef;
  selectedPath?: string;
  onSelectPath(path: string): void;
}

const DEFAULT_SETTINGS: DiffSettings = {
  collapseUnchanged: true,
  ignoreWhitespace: false,
  sideBySide: true,
};

interface FileState {
  path?: string;
  position?: ChangePosition;
  total?: number;
  armed?: Direction;
  hint?: string;
}

export function PullRequestWorkspace({
  target,
  selectedPath,
  onSelectPath,
}: PullRequestWorkspaceProps) {
  const diff = usePullRequestDiff(target);
  const files = useMemo(
    () => (diff.data ? filesInTreeOrder(buildFileTree(diff.data.files)) : []),
    [diff.data],
  );
  const current = files.find((file) => file.path === selectedPath) ?? files[0];
  const [settings, setSettings] = usePreference('diff.settings', DEFAULT_SETTINGS);
  const [jump, setJump] = useState<{ path: string; at: 'first' | 'last' }>();
  const [fileState, setFileState] = useState<FileState>({});
  const viewer = useRef<DiffViewerHandle>(null);
  const state = fileState.path === current?.path ? fileState : { path: current?.path };
  if (jump && jump.path !== current?.path) {
    setJump(undefined);
  }

  function update(changes: Omit<FileState, 'path'>) {
    setFileState({ ...state, ...changes, path: current?.path });
  }

  function mergeFileState(path: string, changes: Omit<FileState, 'path'>) {
    setFileState((previous) =>
      previous.path === path ? { ...previous, ...changes } : { path, ...changes },
    );
  }

  function openFile(path: string, at: 'first' | 'last') {
    setJump({ path, at });
    setFileState({ path });
    onSelectPath(path);
  }

  function navigate(direction: Direction) {
    if (!current) {
      return;
    }
    const outcome = decideNavigation({
      direction,
      moved: viewer.current?.goToChange(direction),
      armed: state.armed,
      neighbor: adjacentFile(files, current.path, direction),
    });
    switch (outcome.kind) {
      case 'moved':
        update({ position: outcome.position, armed: undefined, hint: undefined });
        break;
      case 'armed':
        update({
          armed: direction,
          hint: `Press ${direction === 'next' ? 'F7' : 'Shift+F7'} again to open ${outcome.file.path}`,
        });
        break;
      case 'open-file':
        openFile(outcome.file.path, outcome.at);
        break;
      case 'boundary':
        update({
          armed: undefined,
          hint:
            direction === 'next' ? 'This is the last difference.' : 'This is the first difference.',
        });
        break;
    }
  }

  function switchFile(direction: Direction) {
    const neighbor = adjacentFile(files, current?.path, direction);
    if (neighbor) {
      openFile(neighbor.path, 'first');
    }
  }

  useShortcuts([
    { key: 'F7', run: () => navigate('next') },
    { key: 'F7', shift: true, run: () => navigate('previous') },
    { key: 'ArrowRight', ctrl: true, shift: true, run: () => switchFile('next') },
    { key: 'ArrowLeft', ctrl: true, shift: true, run: () => switchFile('previous') },
  ]);

  return (
    <section className={styles.workspace}>
      <PullRequestHeader target={target} />
      {renderBody()}
    </section>
  );

  function renderBody() {
    if (diff.isPending) {
      return (
        <StatusMessage title="Fetching changes…">
          Downloading the two commits this pull request compares.
        </StatusMessage>
      );
    }
    if (diff.isError) {
      return (
        <StatusMessage
          title="Could not load the changes"
          tone="error"
          onRetry={() => void diff.refetch()}
        >
          {diff.error.message}
        </StatusMessage>
      );
    }
    if (!current) {
      return <StatusMessage>This pull request does not change any files.</StatusMessage>;
    }
    return (
      <>
        <DiffToolbar
          file={current}
          position={state.position}
          total={state.total}
          hint={state.hint}
          settings={settings}
          onSettingsChange={setSettings}
          onNavigate={navigate}
        />
        <FileDiff
          key={current.path}
          target={target}
          file={current}
          settings={settings}
          initialChange={jump?.path === current.path ? jump.at : 'first'}
          onChangesComputed={(total) => mergeFileState(current.path, { total })}
          onReveal={(position) => mergeFileState(current.path, { position })}
          viewerRef={viewer}
        />
      </>
    );
  }
}
