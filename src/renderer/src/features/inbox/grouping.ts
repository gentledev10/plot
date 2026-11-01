import type { PullRequestSummary } from '@shared/github';
import { formatRepositoryRef } from '@shared/repository-ref';

export interface RepositoryGroup {
  key: string;
  name: string;
  pulls: PullRequestSummary[];
}

export function newestFirst(pulls: readonly PullRequestSummary[]): PullRequestSummary[] {
  return [...pulls].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function groupByRepository(pulls: readonly PullRequestSummary[]): RepositoryGroup[] {
  const groups = new Map<string, RepositoryGroup>();
  for (const pull of newestFirst(pulls)) {
    const name = formatRepositoryRef(pull.ref);
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { key, name, pulls: [] };
    group.pulls.push(pull);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function filterPullRequests(
  pulls: readonly PullRequestSummary[],
  query: string,
): PullRequestSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return pulls.filter((pull) => {
    const text = [
      formatRepositoryRef(pull.ref),
      `#${pull.ref.number}`,
      pull.title,
      pull.author.login,
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
