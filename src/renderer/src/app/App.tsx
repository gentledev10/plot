import type { PullRequestRef } from '@shared/github';
import { formatPullRequestRef } from '@shared/pull-request-ref';
import type { CodeLocation } from '@shared/review';
import { useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { FilesPanel } from '../features/files/FilesPanel';
import { InboxPanel } from '../features/inbox/InboxPanel';
import {
  type LocationRequest,
  PullRequestWorkspace,
} from '../features/pull-request/PullRequestWorkspace';
import { ReviewPanel } from '../features/review/ReviewPanel';
import styles from './App.module.css';

interface AppProps {
  platform: string;
}

export function App({ platform }: AppProps) {
  const [open, setOpen] = useState<PullRequestRef>();
  const [lastOpened, setLastOpened] = useState<PullRequestRef>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [reveal, setReveal] = useState<LocationRequest>();

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
            reveal={reveal}
            onSelectPath={setSelectedPath}
          />
        ) : (
          <div className={styles.placeholder}>
            <StatusMessage>Select a pull request to start reviewing.</StatusMessage>
          </div>
        )}
      </main>
      <ReviewPanel target={open} onOpenLocation={openLocation} />
    </div>
  );
}
