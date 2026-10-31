import type { PullRequestRef } from '@shared/github';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { usePreference } from '../../lib/preferences';
import type { Direction } from '../diff/changes';
import { DiffToolbar } from '../diff/DiffToolbar';
import type { ChangePosition, DiffSettings, DiffViewerHandle } from '../diff/DiffViewer';
import { FileDiff } from '../diff/FileDiff';
import { usePullRequestDiff } from '../diff/queries';
import { buildFileTree, filesInTreeOrder } from '../files/file-tree';
import { useCommand, useShortcutLabel } from '../keymap/KeymapProvider';
import { adjacentFile, decideNavigation } from './navigation';
import { PullRequestHeader } from './PullRequestHeader';
import styles from './PullRequestWorkspace.module.css';
import { pullRequestKeys } from './queries';

export interface LocationRequest {
  path: string;
  line: number;
  key: number;
}

interface PullRequestWorkspaceProps {
  target: PullRequestRef;
  selectedPath?: string;
  reveal?: LocationRequest;
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
  reveal,
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
  const queryClient = useQueryClient();
  const nextShortcut = useShortcutLabel('diff.nextDifference');
  const previousShortcut = useShortcutLabel('diff.previousDifference');
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
      case 'armed': {
        const shortcut = direction === 'next' ? nextShortcut : previousShortcut;
        update({
          armed: direction,
          hint: `${shortcut ? `Press ${shortcut}` : 'Go'} again to open ${outcome.file.path}`,
        });
        break;
      }
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

  function toggleSetting(key: keyof DiffSettings) {
    setSettings({ ...settings, [key]: !settings[key] });
  }

  useCommand('diff.nextDifference', () => navigate('next'));
  useCommand('diff.previousDifference', () => navigate('previous'));
  useCommand('diff.nextFile', () => switchFile('next'));
  useCommand('diff.previousFile', () => switchFile('previous'));
  useCommand('diff.toggleSideBySide', () => toggleSetting('sideBySide'));
  useCommand('diff.toggleCollapseUnchanged', () => toggleSetting('collapseUnchanged'));
  useCommand('diff.toggleIgnoreWhitespace', () => toggleSetting('ignoreWhitespace'));
  useCommand('pullRequest.refresh', () => {
    void queryClient.invalidateQueries({ queryKey: pullRequestKeys.detail(target) });
  });

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
    const revealHere = reveal?.path === current.path ? reveal : undefined;
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
          initialChange={revealHere ? undefined : jump?.path === current.path ? jump.at : 'first'}
          revealLine={revealHere ? { line: revealHere.line, key: revealHere.key } : undefined}
          onChangesComputed={(total) => mergeFileState(current.path, { total })}
          onReveal={(position) => mergeFileState(current.path, { position })}
          viewerRef={viewer}
        />
      </>
    );
  }
}
