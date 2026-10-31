// The client ID of the GitHub OAuth app that browser sign-in uses. It is public by design.
// Forks and development builds can set MAIN_VITE_GITHUB_CLIENT_ID instead; see CONTRIBUTING.md.
const DEFAULT_CLIENT_ID = '';

export const GITHUB_OAUTH_CLIENT_ID: string | undefined =
  import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID || DEFAULT_CLIENT_ID || undefined;
