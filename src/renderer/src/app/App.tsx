import type { PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import { useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import { PullRequestWorkspace } from '../features/pull-request/PullRequestWorkspace';
import { ReviewPanel } from '../features/review/ReviewPanel';
import styles from './App.module.css';

interface AppProps {
  platform: string;
}

export function App({ platform }: AppProps) {
  const [open, setOpen] = useState<PullRequestRef>();
  const [lastOpened, setLastOpened] = useState<PullRequestRef>();
  const [selectedPath, setSelectedPath] = useState<string>();

  function openPullRequest(ref: PullRequestRef) {
    setOpen(ref);
    setLastOpened(ref);
    setSelectedPath(undefined);
  }

  function closePullRequest() {
    setOpen(undefined);
    setSelectedPath(undefined);
  }

  return (
    <div className={styles.app} data-platform={platform}>
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
      <main className={styles.workspace}>
        {open ? (
          <PullRequestWorkspace
            key={formatPullRequestRef(open)}
            target={open}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
          />
        ) : (
          <div className={styles.placeholder}>
            <StatusMessage>Select a pull request to start reviewing.</StatusMessage>
          </div>
        )}
      </main>
      <ReviewPanel />
    </div>
  );
}
