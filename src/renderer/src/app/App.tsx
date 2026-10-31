import type { PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import type { CodeLocation } from '@shared/review';
import { FolderTree, GitPullRequest, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import {
  type LocationRequest,
  PullRequestWorkspace,
} from '../features/pull-request/PullRequestWorkspace';
import { ReviewPanel } from '../features/review/ReviewPanel';
import { usePreference } from '../lib/preferences';
import { useShortcuts } from '../lib/shortcuts';
import styles from './App.module.css';
import {
  DEFAULT_LAYOUT,
  type PanelId,
  type PanelLayout,
  parseLayout,
  toggleAllPanels,
  togglePanel,
} from './panels';
import { ToolWindowBar, ToolWindowButton } from './ToolWindowBar';

interface AppProps {
  platform: string;
}

export function App({ platform }: AppProps) {
  const [open, setOpen] = useState<PullRequestRef>();
  const [lastOpened, setLastOpened] = useState<PullRequestRef>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [reveal, setReveal] = useState<LocationRequest>();
  const [layout, setLayout] = usePreference('layout.panels', DEFAULT_LAYOUT, parseLayout);
  const [restore, setRestore] = useState<PanelLayout>();

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

  useShortcuts([
    { key: '1', meta: true, run: () => toggle('sidebar') },
    { key: '2', meta: true, run: () => toggle('review') },
    { key: 'F12', meta: true, shift: true, run: toggleAll },
  ]);

  return (
    <div
      className={styles.app}
      data-platform={platform}
      data-sidebar={layout.sidebar ? 'visible' : 'hidden'}
      data-review={layout.review ? 'visible' : 'hidden'}
    >
      <div className={styles.leftBar}>
        <ToolWindowBar side="left" label="Left tool windows">
          <ToolWindowButton
            label={open ? 'Changed files' : 'Pull requests'}
            shortcut="⌘1"
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
          <InboxPanel selected={lastOpened} onSelect={openPullRequest} />
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
            shortcut="⌘2"
            pressed={layout.review}
            onClick={() => toggle('review')}
          >
            <Sparkles size={16} />
          </ToolWindowButton>
        </ToolWindowBar>
      </div>
    </div>
  );
}
