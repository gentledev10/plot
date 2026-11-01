import type { PullRequestRef, RepositoryRef } from '@shared/github';
import type { LocalRepository } from '@shared/local';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import { formatRepositoryRef } from '@shared/repository-ref';
import type { CodeLocation } from '@shared/review';
import { FolderGit2, GitPullRequest, Settings, Sparkles } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useCurrentAccount } from '../features/accounts/queries';
import type { LocationRequest } from '../features/diff/DiffWorkspace';
import { type DiffTarget, targetKey } from '../features/diff/target';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import { useCommand, useShortcutLabel } from '../features/keymap/KeymapProvider';
import { formatStroke } from '../features/keymap/keystroke';
import { useT } from '../features/language/LanguageProvider';
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
  fitPanels,
  MIN_WORKSPACE_WIDTH,
  type PanelId,
  type PanelLayout,
  parseLayout,
  parseSizes,
  parseToolWindow,
  SIZE_LIMITS,
  TOOL_BARS_WIDTH,
  type ToolWindowId,
  togglePanel,
} from './panels';
import { useMenuCommand, usePlatform } from './providers';
import { ResizeHandle } from './ResizeHandle';
import { ToolWindowBar, ToolWindowButton } from './ToolWindowBar';
export function App() {
  const t = useT();
  const currentAccount = useCurrentAccount();
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
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [panelPriority, setPanelPriority] = useState<PanelId>('sidebar');
  const [contextReview, setContextReview] = useState(false);
  const requestedLayout = {
    sidebar: layout.sidebar,
    review: open?.kind === 'pull-request' ? layout.review : contextReview,
  };
  const fitted = fitPanels(viewportWidth, sizes, requestedLayout, panelPriority);
  const sidebarShown = fitted.layout.sidebar && !maximized;
  const reviewShown = fitted.layout.review || maximized;
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const shell = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<SettingsSection>();
  const [focusOpenField, setFocusOpenField] = useState(false);
  const pullRequestsShortcut = useShortcutLabel('view.togglePullRequests');
  const localChangesShortcut = useShortcutLabel('view.toggleLocalChanges');
  const reviewShortcut = useShortcutLabel('view.toggleReview');
  function show(target: DiffTarget) {
    setContextReview(false);
    setOpen(target);
    setLastOpened(target);
    setToolWindow(target.kind === 'local' ? 'local-changes' : 'pull-requests');
    setSelectedPath(undefined);
    setReveal(undefined);
  }
  function openPullRequest(ref: PullRequestRef) {
    show({
      kind: 'pull-request',
      ref,
    });
  }
  function openLocalRepository(repository: LocalRepository) {
    show({
      kind: 'local',
      repositoryId: repository.id,
      compare: 'branch',
    });
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
    setContextReview(false);
    setMaximized(false);
    setOpen(undefined);
    setSelectedPath(undefined);
    setReveal(undefined);
  }
  function openLocation(location: CodeLocation) {
    setMaximized(false);
    setSelectedPath(location.path);
    setReveal({
      path: location.path,
      line: location.line,
      key: Date.now(),
    });
  }
  function toggle(panel: PanelId) {
    setMaximized(false);
    setPanelPriority(panel);
    if (panel === 'review' && open?.kind !== 'pull-request') setContextReview(!reviewShown);
    else
      setLayout(
        togglePanel(
          {
            ...layout,
            [panel]: fitted.layout[panel],
          },
          panel,
        ),
      );
    setRestore(undefined);
  }
  function toggleWindow(id: ToolWindowId) {
    setMaximized(false);
    setPanelPriority('sidebar');
    setLayout({
      ...layout,
      sidebar: !(sidebarShown && toolWindow === id),
    });
    setToolWindow(id);
    setRestore(undefined);
  }
  function toggleAll() {
    setMaximized(false);
    if (sidebarShown || reviewShown) {
      setRestore(requestedLayout);
      setLayout({
        sidebar: false,
        review: false,
      });
      setContextReview(false);
    } else {
      const next = restore ?? DEFAULT_LAYOUT;
      setLayout(next);
      setContextReview(next.review);
      setRestore(undefined);
    }
  }
  function maxPanelWidth(panel: PanelId) {
    const other = panel === 'sidebar' ? 'review' : 'sidebar';
    const available = viewportWidth - TOOL_BARS_WIDTH - MIN_WORKSPACE_WIDTH - fitted.sizes[other];
    return Math.max(SIZE_LIMITS[panel].min, Math.min(SIZE_LIMITS[panel].max, available));
  }
  function previewSize(panel: PanelId, width: number) {
    shell.current?.style.setProperty(
      `--${panel}-width`,
      `${Math.min(width, maxPanelWidth(panel))}px`,
    );
  }
  function resizeHandle(panel: PanelId, label: string, edge: 'left' | 'right') {
    return (
      <ResizeHandle
        label={label}
        edge={edge}
        width={fitted.sizes[panel]}
        min={SIZE_LIMITS[panel].min}
        max={maxPanelWidth(panel)}
        onPreview={(width) => previewSize(panel, width)}
        onResize={(width) => {
          setPanelPriority(panel);
          setSizes({
            ...sizes,
            [panel]: Math.min(width, maxPanelWidth(panel)),
          });
        }}
        onReset={() =>
          setSizes({
            ...sizes,
            [panel]: DEFAULT_SIZES[panel],
          })
        }
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
    setPanelPriority('sidebar');
    if (!sidebarShown) {
      setLayout({
        ...layout,
        sidebar: true,
      });
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
          '--sidebar-width': sidebarShown ? `${fitted.sizes.sidebar}px` : '0px',
          '--review-width': reviewShown ? `${fitted.sizes.review}px` : '0px',
        } as CSSProperties
      }
      data-platform={platform}
      data-sidebar={sidebarShown ? 'visible' : 'hidden'}
      data-review={reviewShown ? 'visible' : 'hidden'}
      data-maximized={maximized ? 'review' : undefined}
    >
      <div className={styles.leftBar}>
        <ToolWindowBar
          side="left"
          label={t('Left tool windows')}
          footer={
            <ToolWindowButton
              label={t('Settings')}
              shortcut={formatStroke('Meta+,', platform)}
              onClick={() => setSettings('accounts')}
            >
              <Settings size={16} />
            </ToolWindowButton>
          }
        >
          <ToolWindowButton
            label={t('Pull requests')}
            shortcut={pullRequestsShortcut}
            pressed={sidebarShown && toolWindow === 'pull-requests'}
            onClick={() => toggleWindow('pull-requests')}
          >
            <GitPullRequest size={16} />
          </ToolWindowButton>
          <ToolWindowButton
            label={t('Local changes')}
            shortcut={localChangesShortcut}
            pressed={sidebarShown && toolWindow === 'local-changes'}
            onClick={() => toggleWindow('local-changes')}
          >
            <FolderGit2 size={16} />
          </ToolWindowButton>
        </ToolWindowBar>
      </div>
      <div className={styles.sidebar} hidden={!sidebarShown}>
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
              active={sidebarShown && toolWindow === 'local-changes'}
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
            onCompareChange={(compare) =>
              show({
                ...open,
                compare,
              })
            }
            selectedPath={selectedPath}
            reveal={reveal}
            onSelectPath={setSelectedPath}
          />
        )}
        {!open && (
          <div className={styles.placeholder}>
            <h1>{t('Open changes')}</h1>
            <p className={styles.startDescription}>
              {t('Open a local folder or a pull request to compare changes file by file.')}
            </p>
            <div className={styles.startActions}>
              <button type="button" onClick={chooseAndOpenLocalRepository}>
                {t('Open a local folder…')}
              </button>
              <button
                type="button"
                onClick={currentAccount ? startOpeningPullRequest : () => setSettings('accounts')}
              >
                {currentAccount ? t('Open a pull request…') : t('Connect GitHub…')}
              </button>
            </div>
            <p className={styles.startHint}>{t('Local changes work without a GitHub account.')}</p>
          </div>
        )}
      </main>
      <div className={styles.review} hidden={!reviewShown}>
        {!maximized && resizeHandle('review', 'Resize the AI panel', 'left')}
        <ReviewPanel
          target={open?.kind === 'pull-request' ? open.ref : undefined}
          notice={
            open?.kind === 'local'
              ? t(
                  'AI overviews work on pull requests for now. Push the branch and open its pull request to get one.',
                )
              : undefined
          }
          onOpenLocation={openLocation}
          onConfigureAi={() => setSettings('ai')}
          onConfigurePlan={() => setSettings('review-format')}
          maximized={maximized}
          onToggleMaximize={() => setMaximized(!maximized)}
        />
      </div>
      <div className={styles.rightBar}>
        <ToolWindowBar side="right" label={t('Right tool windows')}>
          <ToolWindowButton
            label={t('AI overview')}
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
