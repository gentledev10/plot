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
  | 'unknown';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
