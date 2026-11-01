import type { PullRequestRef, RepositoryRef } from '@shared/github';
import type { LocalRepository } from '@shared/local';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import { formatRepositoryRef } from '@shared/repository-ref';
import type { CodeLocation } from '@shared/review';
import { FolderGit2, GitPullRequest, Settings, Sparkles } from 'lucide-react';
import { type CSSProperties, useRef, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import type { LocationRequest } from '../features/diff/DiffWorkspace';
import { type DiffTarget, targetKey } from '../features/diff/target';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import { useCommand, useShortcutLabel } from '../features/keymap/KeymapProvider';
import { formatStroke } from '../features/keymap/keystroke';
import { LocalChangesPanel } from '../features/local/LocalChangesPanel';
import { LocalPullRequestLink } from '../features/local/LocalPullRequestLink';
import { LocalWorkspace } from '../features/local/LocalWorkspace';
import { useLocalRepositories, useLocalRepositoryActions } from '../features/local/queries';
import { PullRequestWorkspace } from '../features/pull-request/PullRequestWorkspace';
import { RepositoryPullsPanel } from '../features/repositories/RepositoryPullsPanel';
import { ReviewPanel } from '../features/review/ReviewPanel';
import { SettingsDialog, type SettingsSection } from '../features/settings/SettingsDialog';
import { usePreference } from '../lib/preferences';
import styles from './App.module.css';
import {
  DEFAULT_LAYOUT,
  DEFAULT_SIZES,
  DEFAULT_TOOL_WINDOW,
  type PanelId,
  type PanelLayout,
  parseLayout,
  parseSizes,
  parseToolWindow,
  SIZE_LIMITS,
  type ToolWindowId,
  toggleAllPanels,
  togglePanel,
  toggleToolWindow,
} from './panels';
import { useMenuCommand, usePlatform } from './providers';
import { ResizeHandle } from './ResizeHandle';
import { ToolWindowBar, ToolWindowButton } from './ToolWindowBar';

export function App() {
  const platform = usePlatform();
  const [open, setOpen] = useState<DiffTarget>();
  const [lastOpened, setLastOpened] = useState<DiffTarget>();
  const [browsing, setBrowsing] = useState<RepositoryRef>();
  const localRepositories = useLocalRepositories();
  const { open: chooseLocalRepository } = useLocalRepositoryActions();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [reveal, setReveal] = useState<LocationRequest>();
  const [layout, setLayout] = usePreference('layout.panels', DEFAULT_LAYOUT, parseLayout);
  const [toolWindow, setToolWindow] = usePreference(
    'layout.toolWindow',
    DEFAULT_TOOL_WINDOW,
    parseToolWindow,
  );
  const [restore, setRestore] = useState<PanelLayout>();
  const [sizes, setSizes] = usePreference('layout.sizes', DEFAULT_SIZES, parseSizes);
  const [maximized, setMaximized] = useState(false);
  const reviewShown = layout.review || maximized;
  const shell = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<SettingsSection>();
  const [focusOpenField, setFocusOpenField] = useState(false);
  const pullRequestsShortcut = useShortcutLabel('view.togglePullRequests');
  const localChangesShortcut = useShortcutLabel('view.toggleLocalChanges');
  const reviewShortcut = useShortcutLabel('view.toggleReview');

  function show(target: DiffTarget) {
    setOpen(target);
    setLastOpened(target);
    setToolWindow(target.kind === 'local' ? 'local-changes' : 'pull-requests');
    setSelectedPath(undefined);
    setReveal(undefined);
  }

  function openPullRequest(ref: PullRequestRef) {
    show({ kind: 'pull-request', ref });
  }

  function openLocalRepository(repository: LocalRepository) {
    show({ kind: 'local', repositoryId: repository.id, compare: 'branch' });
  }

  function chooseAndOpenLocalRepository() {
    chooseLocalRepository.mutate(undefined, {
      onSuccess: (repository) => {
        if (repository) {
          openLocalRepository(repository);
        }
      },
    });
  }

  function titleOf(target: DiffTarget): string {
    if (target.kind === 'pull-request') {
      return formatPullRequestRef(target.ref);
    }
    const repository = localRepositories.data?.find((item) => item.id === target.repositoryId);
    return repository?.name ?? 'Local repository';
  }

  function backToList() {
    setMaximized(false);
    setOpen(undefined);
    setSelectedPath(undefined);
    setReveal(undefined);
  }

  function openLocation(location: CodeLocation) {
    setMaximized(false);
    setSelectedPath(location.path);
    setReveal({ path: location.path, line: location.line, key: Date.now() });
  }

  function toggle(panel: PanelId) {
    setMaximized(false);
    setLayout(togglePanel(layout, panel));
    setRestore(undefined);
  }

  function toggleWindow(id: ToolWindowId) {
    setMaximized(false);
    const next = toggleToolWindow({ layout, window: toolWindow }, id);
    setLayout(next.layout);
    setToolWindow(next.window);
    setRestore(undefined);
  }

  function toggleAll() {
    setMaximized(false);
    const next = toggleAllPanels(layout, restore);
    setLayout(next.layout);
    setRestore(next.restore);
  }

  function previewSize(panel: PanelId, width: number) {
    shell.current?.style.setProperty(`--${panel}-width`, `${width}px`);
  }

  function resizeHandle(panel: PanelId, label: string, edge: 'left' | 'right') {
    return (
      <ResizeHandle
        label={label}
        edge={edge}
        width={sizes[panel]}
        min={SIZE_LIMITS[panel].min}
        max={SIZE_LIMITS[panel].max}
        onPreview={(width) => previewSize(panel, width)}
        onResize={(width) => setSizes({ ...sizes, [panel]: width })}
        onReset={() => setSizes({ ...sizes, [panel]: DEFAULT_SIZES[panel] })}
      />
    );
  }

  function goBack() {
    if (open) {
      backToList();
    } else {
      setBrowsing(undefined);
    }
  }

  function startOpeningPullRequest() {
    backToList();
    setBrowsing(undefined);
    if (!layout.sidebar) {
      setLayout({ ...layout, sidebar: true });
    }
    setToolWindow('pull-requests');
    setFocusOpenField(true);
  }

  useCommand('view.togglePullRequests', () => toggleWindow('pull-requests'));
  useCommand('view.toggleLocalChanges', () => toggleWindow('local-changes'));
  useCommand('view.toggleReview', () => toggle('review'));
  useCommand('view.maximizeReview', () => setMaximized(!maximized));
  useCommand('view.toggleAllPanels', toggleAll);
  useCommand('pullRequest.open', startOpeningPullRequest);
  useCommand(
    'navigation.back',
    goBack,
    open !== undefined || (browsing !== undefined && toolWindow === 'pull-requests'),
  );
  useCommand('local.open', chooseAndOpenLocalRepository);
  useMenuCommand('open-local-repository', chooseAndOpenLocalRepository);
  useMenuCommand('open-settings', () => setSettings('accounts'));
  useMenuCommand('open-keymap', () => setSettings('keymap'));

  return (
    <div
      ref={shell}
      className={styles.app}
      style={
        {
          '--sidebar-width': layout.sidebar ? `${sizes.sidebar}px` : '0px',
          '--review-width': reviewShown ? `${sizes.review}px` : '0px',
        } as CSSProperties
      }
      data-platform={platform}
      data-sidebar={layout.sidebar ? 'visible' : 'hidden'}
      data-review={reviewShown ? 'visible' : 'hidden'}
      data-maximized={maximized ? 'review' : undefined}
    >
      <div className={styles.leftBar}>
        <ToolWindowBar
          side="left"
          label="Left tool windows"
          footer={
            <ToolWindowButton
              label="Settings"
              shortcut={formatStroke('Meta+,', platform)}
              onClick={() => setSettings('accounts')}
            >
              <Settings size={16} />
            </ToolWindowButton>
          }
        >
          <ToolWindowButton
            label="Pull requests"
            shortcut={pullRequestsShortcut}
            pressed={layout.sidebar && toolWindow === 'pull-requests'}
            onClick={() => toggleWindow('pull-requests')}
          >
            <GitPullRequest size={16} />
          </ToolWindowButton>
          <ToolWindowButton
            label="Local changes"
            shortcut={localChangesShortcut}
            pressed={layout.sidebar && toolWindow === 'local-changes'}
            onClick={() => toggleWindow('local-changes')}
          >
            <FolderGit2 size={16} />
          </ToolWindowButton>
        </ToolWindowBar>
      </div>
      <div className={styles.sidebar} hidden={!layout.sidebar || maximized}>
        {resizeHandle('sidebar', 'Resize the sidebar', 'right')}
        <div className={styles.toolWindow} hidden={toolWindow !== 'pull-requests'}>
          {open?.kind === 'pull-request' ? (
            <FilesPanel
              target={open}
              title={titleOf(open)}
              backLabel={browsing ? formatRepositoryRef(browsing) : 'Pull requests'}
              selectedPath={selectedPath}
              onSelectFile={setSelectedPath}
              onBack={backToList}
            />
          ) : browsing ? (
            <RepositoryPullsPanel
              repository={browsing}
              selected={lastOpened?.kind === 'pull-request' ? lastOpened.ref : undefined}
              onSelect={openPullRequest}
              onBack={() => setBrowsing(undefined)}
            />
          ) : (
            <InboxPanel
              selected={lastOpened?.kind === 'pull-request' ? lastOpened.ref : undefined}
              onSelect={openPullRequest}
              focusOpenField={focusOpenField}
              onOpenFieldFocused={() => setFocusOpenField(false)}
              onManageAccounts={() => setSettings('accounts')}
              onOpenRepository={setBrowsing}
            />
          )}
        </div>
        <div className={styles.toolWindow} hidden={toolWindow !== 'local-changes'}>
          {open?.kind === 'local' ? (
            <FilesPanel
              target={open}
              title={titleOf(open)}
              backLabel="Local changes"
              details={
                <LocalPullRequestLink repositoryId={open.repositoryId} onOpen={openPullRequest} />
              }
              selectedPath={selectedPath}
              onSelectFile={setSelectedPath}
              onBack={backToList}
            />
          ) : (
            <LocalChangesPanel
              selectedId={lastOpened?.kind === 'local' ? lastOpened.repositoryId : undefined}
              active={layout.sidebar && !maximized && toolWindow === 'local-changes'}
              onOpen={openLocalRepository}
            />
          )}
        </div>
      </div>
      <main className={styles.workspace} hidden={maximized}>
        {open?.kind === 'pull-request' && (
          <PullRequestWorkspace
            key={targetKey(open)}
            target={open.ref}
            selectedPath={selectedPath}
            reveal={reveal}
            onSelectPath={setSelectedPath}
          />
        )}
        {open?.kind === 'local' && (
          <LocalWorkspace
            key={targetKey(open)}
            repositoryId={open.repositoryId}
            compare={open.compare}
            onCompareChange={(compare) => show({ ...open, compare })}
            selectedPath={selectedPath}
            reveal={reveal}
            onSelectPath={setSelectedPath}
          />
        )}
        {!open && (
          <div className={styles.placeholder}>
            <StatusMessage
              action={
                layout.sidebar
                  ? undefined
                  : { label: 'Show pull requests', run: () => toggleWindow('pull-requests') }
              }
            >
              Select a pull request or a local repository to see what changed.
            </StatusMessage>
          </div>
        )}
      </main>
      <div className={styles.review} hidden={!reviewShown}>
        {!maximized && resizeHandle('review', 'Resize the AI panel', 'left')}
        <ReviewPanel
          target={open?.kind === 'pull-request' ? open.ref : undefined}
          notice={
            open?.kind === 'local'
              ? 'AI overviews work on pull requests for now. Push the branch and open its pull request to get one.'
              : undefined
          }
          onOpenLocation={openLocation}
          onConfigureAi={() => setSettings('ai')}
          maximized={maximized}
          onToggleMaximize={() => setMaximized(!maximized)}
        />
      </div>
      <div className={styles.rightBar}>
        <ToolWindowBar side="right" label="Right tool windows">
          <ToolWindowButton
            label="AI overview"
            shortcut={reviewShortcut}
            pressed={reviewShown}
            onClick={() => toggle('review')}
          >
            <Sparkles size={16} />
          </ToolWindowButton>
        </ToolWindowBar>
      </div>
      {settings && (
        <SettingsDialog
          section={settings}
          onSectionChange={setSettings}
          onClose={() => setSettings(undefined)}
        />
      )}
    </div>
  );
}
