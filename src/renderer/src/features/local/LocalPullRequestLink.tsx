import type { PullRequestRef } from '@shared/github';
import { GitPullRequest } from 'lucide-react';
import styles from './LocalPullRequestLink.module.css';
import { useLocalPullRequest, useLocalStatus } from './queries';

interface LocalPullRequestLinkProps {
  repositoryId: string;
  onOpen(ref: PullRequestRef): void;
}

export function LocalPullRequestLink({ repositoryId, onOpen }: LocalPullRequestLinkProps) {
  const branch = useLocalStatus(repositoryId, false).data?.branch;
  const pull = useLocalPullRequest(repositoryId, branch).data;
  if (!pull) {
    return null;
  }
  return (
    <button
      type="button"
      className={styles.link}
      title={pull.title}
      onClick={() => onOpen(pull.ref)}
    >
      <GitPullRequest size={12} aria-hidden="true" />
      Pull request #{pull.ref.number}
    </button>
  );
}
