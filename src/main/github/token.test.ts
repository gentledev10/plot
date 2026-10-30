import { describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandRunner } from '../system/process';
import { createGhTokenProvider } from './token';

function runnerReturning(stdout: string) {
  return vi.fn<CommandRunner>().mockResolvedValue({ stdout, stderr: '' });
}

describe('createGhTokenProvider', () => {
  it('reads the token for the host from gh and trims it', async () => {
    const run = runnerReturning('gho_secret\n');
    const tokens = createGhTokenProvider(run);

    await expect(tokens.getToken()).resolves.toBe('gho_secret');
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['auth', 'token', '--hostname', 'github.com'],
      expect.anything(),
    );
  });

  it('asks gh only once, even for concurrent callers', async () => {
    const run = runnerReturning('gho_secret');
    const tokens = createGhTokenProvider(run);

    await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asks gh again after the token is invalidated', async () => {
    const run = vi
      .fn<CommandRunner>()
      .mockResolvedValueOnce({ stdout: 'old', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'new', stderr: '' });
    const tokens = createGhTokenProvider(run);

    await expect(tokens.getToken()).resolves.toBe('old');
    tokens.invalidate();
    await expect(tokens.getToken()).resolves.toBe('new');
  });

  it('reports a missing gh binary', async () => {
    const run = vi.fn<CommandRunner>().mockRejectedValue(new CommandError('not-found', 'gh', ''));
    await expect(createGhTokenProvider(run).getToken()).rejects.toMatchObject({
      code: 'gh-not-installed',
    });
  });

  it('reports a signed-out gh', async () => {
    const run = vi
      .fn<CommandRunner>()
      .mockRejectedValue(new CommandError('exit', 'gh', 'no oauth token found', 1));
    await expect(createGhTokenProvider(run).getToken()).rejects.toMatchObject({
      code: 'gh-not-authenticated',
    });
  });

  it('treats empty output as signed out', async () => {
    await expect(createGhTokenProvider(runnerReturning('\n')).getToken()).rejects.toMatchObject({
      code: 'gh-not-authenticated',
    });
  });

  it('does not cache failures', async () => {
    const run = vi
      .fn<CommandRunner>()
      .mockRejectedValueOnce(new CommandError('exit', 'gh', '', 1))
      .mockResolvedValueOnce({ stdout: 'gho_after_login', stderr: '' });
    const tokens = createGhTokenProvider(run);

    await expect(tokens.getToken()).rejects.toBeDefined();
    await expect(tokens.getToken()).resolves.toBe('gho_after_login');
  });
});
