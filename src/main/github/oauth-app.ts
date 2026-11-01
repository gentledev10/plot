// The client ID of the GitHub OAuth app that browser sign-in uses. It is public by design.
// Forks and development builds can set MAIN_VITE_GITHUB_CLIENT_ID instead; see CONTRIBUTING.md.
const DEFAULT_CLIENT_ID = 'Ov23liflQ6eTeBydgVpP';

export const GITHUB_OAUTH_CLIENT_ID: string | undefined =
  import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID || DEFAULT_CLIENT_ID || undefined;

// GitHub requires the client secret to finish a browser sign-in even with PKCE, so release builds
// carry it, where anyone could read it anyway. It stays out of the repository. Builds without it
// fall back to sign-in with a one-time code.
export const GITHUB_OAUTH_CLIENT_SECRET: string | undefined =
  import.meta.env.MAIN_VITE_GITHUB_CLIENT_SECRET || undefined;
