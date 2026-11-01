import { describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandRunner } from '../system/process';
import type { OAuthTokens } from './oauth';
import { createGhTokenProvider, storedTokens } from './token';

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

  it('asks for a specific account when there are several', async () => {
    const run = runnerReturning('ghp_work');
    const tokens = createGhTokenProvider(run, { host: 'github.example.com', user: 'mona' });

    await expect(tokens.getToken()).resolves.toBe('ghp_work');
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['auth', 'token', '--hostname', 'github.example.com', '--user', 'mona'],
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

describe('storedTokens', () => {
  const HOUR = 3_600_000;

  function setup(initial: OAuthTokens, { canRefresh = true } = {}) {
    let stored = initial;
    let time = 0;
    const refresh = vi.fn(async (refreshToken: string) => ({
      accessToken: `fresh-from-${refreshToken}`,
      refreshToken: 'ghr_next',
      expiresAt: time + 8 * HOUR,
    }));
    const save = vi.fn(async (tokens: OAuthTokens) => {
      stored = tokens;
    });
    const tokens = storedTokens({
      read: async () => stored,
      save,
      refresh: canRefresh ? refresh : undefined,
      now: () => time,
    });
    return {
      tokens,
      refresh,
      save,
      setTime: (value: number) => {
        time = value;
      },
    };
  }

  it('uses a token that does not expire as it is', async () => {
    const { tokens, refresh } = setup({ accessToken: 'ghp_forever' });
    await expect(tokens.getToken()).resolves.toBe('ghp_forever');
    tokens.invalidate('ghp_forever');
    await expect(tokens.getToken()).resolves.toBe('ghp_forever');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes a token shortly before it expires and saves the new pair', async () => {
    const { tokens, refresh, save, setTime } = setup({
      accessToken: 'ghu_old',
      refreshToken: 'ghr_old',
      expiresAt: 8 * HOUR,
    });
    await expect(tokens.getToken()).resolves.toBe('ghu_old');

    setTime(8 * HOUR - 60_000);
    await expect(tokens.getToken()).resolves.toBe('fresh-from-ghr_old');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'fresh-from-ghr_old', refreshToken: 'ghr_next' }),
    );
  });

  it('refreshes once for requests that need a token at the same time', async () => {
    const { tokens, refresh } = setup({
      accessToken: 'ghu_old',
      refreshToken: 'ghr_old',
      expiresAt: 0,
    });
    await expect(
      Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]),
    ).resolves.toEqual(['fresh-from-ghr_old', 'fresh-from-ghr_old', 'fresh-from-ghr_old']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes once after GitHub rejects a token, however many requests saw it fail', async () => {
    const { tokens, refresh } = setup({
      accessToken: 'ghu_old',
      refreshToken: 'ghr_old',
      expiresAt: 8 * HOUR,
    });
    const rejected = await tokens.getToken();

    tokens.invalidate(rejected);
    const retry = tokens.getToken();
    tokens.invalidate(rejected);
    await expect(retry).resolves.toBe('fresh-from-ghr_old');
    tokens.invalidate(rejected);

    await expect(tokens.getToken()).resolves.toBe('fresh-from-ghr_old');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('asks to sign in again when an expired token cannot be refreshed', async () => {
    const outdated = setup({
      accessToken: 'ghu_old',
      refreshToken: 'ghr_old',
      expiresAt: 0,
      refreshTokenExpiresAt: 0,
    });
    await expect(outdated.tokens.getToken()).rejects.toMatchObject({
      code: 'github-unauthorized',
    });

    const noApp = setup(
      { accessToken: 'ghu_old', refreshToken: 'ghr_old', expiresAt: 0 },
      { canRefresh: false },
    );
    await expect(noApp.tokens.getToken()).rejects.toMatchObject({ code: 'github-unauthorized' });
  });
});
