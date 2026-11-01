import { type ReactNode, useMemo, useRef, useState } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { usePreference } from '../../lib/preferences';
import { buildFileTree, filesInTreeOrder } from '../files/file-tree';
import { useCommand, useShortcutLabel } from '../keymap/KeymapProvider';
import { useT } from '../language/LanguageProvider';
import { adjacentFile, decideNavigation } from '../pull-request/navigation';
import type { Direction } from './changes';
import { DiffToolbar } from './DiffToolbar';
import type { ChangePosition, DiffSettings, DiffViewerHandle } from './DiffViewer';
import styles from './DiffWorkspace.module.css';
import { FileDiff } from './FileDiff';
import { useTargetDiff } from './queries';
import type { DiffTarget } from './target';
export interface LocationRequest {
  path: string;
  line: number;
  key: number;
}
export interface WorkspaceSelection {
  selectedPath?: string;
  reveal?: LocationRequest;
  onSelectPath(path: string): void;
}
interface DiffWorkspaceProps extends WorkspaceSelection {
  target: DiffTarget;
  header: ReactNode;
  onRefresh(): void;
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
export function DiffWorkspace({
  target,
  header,
  onRefresh,
  selectedPath,
  reveal,
  onSelectPath,
}: DiffWorkspaceProps) {
  const t = useT();
  const diff = useTargetDiff(target);
  const files = useMemo(
    () => (diff.data ? filesInTreeOrder(buildFileTree(diff.data.files)) : []),
    [diff.data],
  );
  const current = files.find((file) => file.path === selectedPath) ?? files[0];
  const [settings, setSettings] = usePreference('diff.settings', DEFAULT_SETTINGS);
  const [jump, setJump] = useState<{
    path: string;
    at: 'first' | 'last';
  }>();
  const [fileState, setFileState] = useState<FileState>({});
  const viewer = useRef<DiffViewerHandle>(null);
  const nextShortcut = useShortcutLabel('diff.nextDifference');
  const previousShortcut = useShortcutLabel('diff.previousDifference');
  const state =
    fileState.path === current?.path
      ? fileState
      : {
          path: current?.path,
        };
  if (jump && jump.path !== current?.path) {
    setJump(undefined);
  }
  function update(changes: Omit<FileState, 'path'>) {
    setFileState({
      ...state,
      ...changes,
      path: current?.path,
    });
  }
  function mergeFileState(path: string, changes: Omit<FileState, 'path'>) {
    setFileState((previous) =>
      previous.path === path
        ? {
            ...previous,
            ...changes,
          }
        : {
            path,
            ...changes,
          },
    );
  }
  function openFile(path: string, at: 'first' | 'last') {
    setJump({
      path,
      at,
    });
    setFileState({
      path,
    });
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
        update({
          position: outcome.position,
          armed: undefined,
          hint: undefined,
        });
        break;
      case 'armed': {
        const shortcut = direction === 'next' ? nextShortcut : previousShortcut;
        update({
          armed: direction,
          hint: t('Press {shortcut} again to open {path}', {
            shortcut: shortcut ?? '',
            path: outcome.file.path,
          }),
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
            direction === 'next'
              ? t('This is the last difference.')
              : t('This is the first difference.'),
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
    setSettings({
      ...settings,
      [key]: !settings[key],
    });
  }
  useCommand('diff.nextDifference', () => navigate('next'));
  useCommand('diff.previousDifference', () => navigate('previous'));
  useCommand('diff.nextFile', () => switchFile('next'));
  useCommand('diff.previousFile', () => switchFile('previous'));
  useCommand('diff.toggleSideBySide', () => toggleSetting('sideBySide'));
  useCommand('diff.toggleCollapseUnchanged', () => toggleSetting('collapseUnchanged'));
  useCommand('diff.toggleIgnoreWhitespace', () => toggleSetting('ignoreWhitespace'));
  useCommand('navigation.refresh', onRefresh);
  return (
    <section className={styles.workspace}>
      {header}
      {renderBody()}
    </section>
  );
  function renderBody() {
    if (diff.isPending) {
      return (
        <StatusMessage title={t('Fetching changes…')}>
          {target.kind === 'pull-request'
            ? t('Downloading the two commits this pull request compares.')
            : t('Reading the changes in your repository.')}
        </StatusMessage>
      );
    }
    if (diff.isError) {
      return (
        <StatusMessage
          title={t('Could not load the changes')}
          tone="error"
          onRetry={() => void diff.refetch()}
        >
          {diff.error.message}
        </StatusMessage>
      );
    }
    if (!current) {
      return (
        <StatusMessage>
          {target.kind === 'pull-request'
            ? t('This pull request does not change any files.')
            : t('There are no changes to show.')}
        </StatusMessage>
      );
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
          revealLine={
            revealHere
              ? {
                  line: revealHere.line,
                  key: revealHere.key,
                }
              : undefined
          }
          onChangesComputed={(total) =>
            mergeFileState(current.path, {
              total,
            })
          }
          onReveal={(position) =>
            mergeFileState(current.path, {
              position,
            })
          }
          viewerRef={viewer}
        />
      </>
    );
  }
}
