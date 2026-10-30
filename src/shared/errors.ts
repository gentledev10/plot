export type ErrorCode =
  | 'invalid-argument'
  | 'forbidden'
  | 'gh-not-installed'
  | 'gh-not-authenticated'
  | 'github-unauthorized'
  | 'github-sso-required'
  | 'github-not-found'
  | 'github-rate-limited'
  | 'github-request-failed'
  | 'network'
  | 'git-not-installed'
  | 'git-failed'
  | 'ai-not-installed'
  | 'ai-failed'
  | 'ai-cancelled'
  | 'ai-invalid-output'
  | 'unknown';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
