import type { PullRequestRef } from '@shared/github';
import { useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { InboxPanel } from '../features/inbox/InboxPanel';
import { PullRequestView } from '../features/pull-request/PullRequestView';
import { ReviewPanel } from '../features/review/ReviewPanel';
import styles from './App.module.css';

interface AppProps {
  platform: string;
}

export function App({ platform }: AppProps) {
  const [selected, setSelected] = useState<PullRequestRef>();

  return (
    <div className={styles.app} data-platform={platform}>
      <InboxPanel selected={selected} onSelect={setSelected} />
      <main className={styles.workspace}>
        {selected ? (
          <PullRequestView target={selected} />
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
