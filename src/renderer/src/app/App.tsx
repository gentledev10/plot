import type { PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import type { CodeLocation } from '@shared/review';
import { FolderTree, GitPullRequest, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import { useCommand, useShortcutLabel } from '../features/keymap/KeymapProvider';
import { formatStroke } from '../features/keymap/keystroke';
import {
  type LocationRequest,
  PullRequestWorkspace,
} from '../features/pull-request/PullRequestWorkspace';
import { ReviewPanel } from '../features/review/ReviewPanel';
import { SettingsDialog, type SettingsSection } from '../features/settings/SettingsDialog';
import { usePreference } from '../lib/preferences';
import styles from './App.module.css';
import {
  DEFAULT_LAYOUT,
  type PanelId,
  type PanelLayout,
  parseLayout,
  toggleAllPanels,
  togglePanel,
} from './panels';
import { useMenuCommand, usePlatform } from './providers';
import { ToolWindowBar, ToolWindowButton } from './ToolWindowBar';

export function App() {
  const platform = usePlatform();
  const [open, setOpen] = useState<PullRequestRef>();
  const [lastOpened, setLastOpened] = useState<PullRequestRef>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [reveal, setReveal] = useState<LocationRequest>();
  const [layout, setLayout] = usePreference('layout.panels', DEFAULT_LAYOUT, parseLayout);
  const [restore, setRestore] = useState<PanelLayout>();
  const [settings, setSettings] = useState<SettingsSection>();
  const [focusOpenField, setFocusOpenField] = useState(false);
  const sidebarShortcut = useShortcutLabel('view.toggleSidebar');
  const reviewShortcut = useShortcutLabel('view.toggleReview');

  function openPullRequest(ref: PullRequestRef) {
    setOpen(ref);
    setLastOpened(ref);
    setSelectedPath(undefined);
    setReveal(undefined);
  }

  function closePullRequest() {
    setOpen(undefined);
    setSelectedPath(undefined);
    setReveal(undefined);
  }

  function openLocation(location: CodeLocation) {
    setSelectedPath(location.path);
    setReveal({ path: location.path, line: location.line, key: Date.now() });
  }

  function toggle(panel: PanelId) {
    setLayout(togglePanel(layout, panel));
    setRestore(undefined);
  }

  function toggleAll() {
    const next = toggleAllPanels(layout, restore);
    setLayout(next.layout);
    setRestore(next.restore);
  }

  function startOpeningPullRequest() {
    closePullRequest();
    if (!layout.sidebar) {
      setLayout({ ...layout, sidebar: true });
    }
    setFocusOpenField(true);
  }

  useCommand('view.toggleSidebar', () => toggle('sidebar'));
  useCommand('view.toggleReview', () => toggle('review'));
  useCommand('view.toggleAllPanels', toggleAll);
  useCommand('pullRequest.open', startOpeningPullRequest);
  useCommand('pullRequest.back', closePullRequest, open !== undefined);
  useMenuCommand('open-settings', () => setSettings('keymap'));
  useMenuCommand('open-keymap', () => setSettings('keymap'));

  return (
    <div
      className={styles.app}
      data-platform={platform}
      data-sidebar={layout.sidebar ? 'visible' : 'hidden'}
      data-review={layout.review ? 'visible' : 'hidden'}
    >
      <div className={styles.leftBar}>
        <ToolWindowBar
          side="left"
          label="Left tool windows"
          footer={
            <ToolWindowButton
              label="Settings"
              shortcut={formatStroke('Meta+,', platform)}
              onClick={() => setSettings('keymap')}
            >
              <Settings size={16} />
            </ToolWindowButton>
          }
        >
          <ToolWindowButton
            label={open ? 'Changed files' : 'Pull requests'}
            shortcut={sidebarShortcut}
            pressed={layout.sidebar}
            onClick={() => toggle('sidebar')}
          >
            {open ? <FolderTree size={16} /> : <GitPullRequest size={16} />}
          </ToolWindowButton>
        </ToolWindowBar>
      </div>
      <div className={styles.sidebar} hidden={!layout.sidebar}>
        {open ? (
          <FilesPanel
            target={open}
            selectedPath={selectedPath}
            onSelectFile={setSelectedPath}
            onBack={closePullRequest}
          />
        ) : (
          <InboxPanel
            selected={lastOpened}
            onSelect={openPullRequest}
            focusOpenField={focusOpenField}
            onOpenFieldFocused={() => setFocusOpenField(false)}
          />
        )}
      </div>
      <main className={styles.workspace}>
        {open ? (
          <PullRequestWorkspace
            key={formatPullRequestRef(open)}
            target={open}
            selectedPath={selectedPath}
            reveal={reveal}
            onSelectPath={setSelectedPath}
          />
        ) : (
          <div className={styles.placeholder}>
            <StatusMessage
              action={
                layout.sidebar
                  ? undefined
                  : { label: 'Show pull requests', run: () => toggle('sidebar') }
              }
            >
              Select a pull request to start reviewing.
            </StatusMessage>
          </div>
        )}
      </main>
      <div className={styles.review} hidden={!layout.review}>
        <ReviewPanel target={open} onOpenLocation={openLocation} />
      </div>
      <div className={styles.rightBar}>
        <ToolWindowBar side="right" label="Right tool windows">
          <ToolWindowButton
            label="AI review"
            shortcut={reviewShortcut}
            pressed={layout.review}
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
