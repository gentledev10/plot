export type ErrorCode =
  | 'invalid-argument'
  | 'forbidden'
  | 'github-no-account'
  | 'sign-in-failed'
  | 'sign-in-cancelled'
  | 'secure-storage-unavailable'
  | 'gh-not-installed'
  | 'gh-not-authenticated'
  | 'github-unauthorized'
  | 'github-sso-required'
  | 'github-not-found'
  | 'github-rate-limited'
  | 'github-request-failed'
  | 'network'
  | 'not-a-repository'
  | 'git-not-installed'
  | 'git-failed'
  | 'ai-not-installed'
  | 'ai-not-configured'
  | 'ai-failed'
  | 'ai-cancelled'
  | 'ai-invalid-output'
  | 'unknown';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
