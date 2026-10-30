import { describe, expect, it } from 'vitest';
import { AppError, toErrorPayload } from './errors';

describe('toErrorPayload', () => {
  it('passes the code and message of app errors to the renderer', () => {
    expect(toErrorPayload(new AppError('github-not-found', 'Not found.'))).toEqual({
      code: 'github-not-found',
      message: 'Not found.',
    });
  });

  it('hides the details of unexpected errors', () => {
    const payload = toErrorPayload(new Error('ENOENT: /Users/someone/secret/path'));
    expect(payload.code).toBe('unknown');
    expect(payload.message).not.toContain('/Users/someone');
  });

  it('handles values that are not errors', () => {
    expect(toErrorPayload('boom').code).toBe('unknown');
  });
});
