import type { ErrorCode, ErrorPayload } from '@shared/errors';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'unknown', message: 'Something went wrong. See the app log for details.' };
}
