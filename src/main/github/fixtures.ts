export const octocat = {
  login: 'octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

export function searchItem(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add dark mode',
    repository_url: 'https://api.github.com/repos/octocat/hello-world',
    html_url: 'https://github.com/octocat/hello-world/pull/42',
    updated_at: '2026-10-30T10:00:00Z',
    draft: false,
    state: 'open',
    user: octocat,
    pull_request: {
      url: 'https://api.github.com/repos/octocat/hello-world/pulls/42',
      merged_at: null,
    },
    ...overrides,
  };
}

export function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add dark mode',
    body: 'Adds a dark theme.',
    html_url: 'https://github.com/octocat/hello-world/pull/42',
    updated_at: '2026-10-30T10:00:00Z',
    node_id: 'PR_kwDOAAAAAA42',
    state: 'open',
    draft: false,
    merged: false,
    merged_at: null,
    user: octocat,
    base: {
      ref: 'main',
      sha: 'a'.repeat(40),
      repo: { name: 'hello-world', owner: { login: 'octocat' } },
    },
    head: { ref: 'dark-mode', sha: 'b'.repeat(40) },
    additions: 120,
    deletions: 8,
    changed_files: 6,
    ...overrides,
  };
}
