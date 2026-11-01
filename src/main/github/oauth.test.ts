import { describe, expect, it, vi } from 'vitest';
import type { Fetch } from './client';
import { parseTokens, refreshTokens } from './oauth';

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

describe('parseTokens', () => {
  it('reads an access token that does not expire', () => {
    expect(parseTokens({ access_token: 'gho_a', token_type: 'bearer' }, 1_000)).toEqual({
      accessToken: 'gho_a',
    });
  });

  it('turns lifetimes into times, including lifetimes sent as text', () => {
    expect(
      parseTokens(
        {
          access_token: 'ghu_a',
          refresh_token: 'ghr_a',
          expires_in: '28800',
          refresh_token_expires_in: 15_897_600,
        },
        1_000,
      ),
    ).toEqual({
      accessToken: 'ghu_a',
      refreshToken: 'ghr_a',
      expiresAt: 1_000 + 28_800_000,
      refreshTokenExpiresAt: 1_000 + 15_897_600_000,
    });
  });

  it('finds no tokens in an error answer', () => {
    expect(parseTokens({ error: 'bad_verification_code' }, 0)).toBeUndefined();
  });
});

describe('refreshTokens', () => {
  it('trades the refresh token for a new pair', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        json({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28_800 }),
      );
    const app = { fetch, clientId: 'Iv1.test', clientSecret: 'shh', userAgent: 'Plot/test' };

    await expect(refreshTokens(app, 'ghr_old', () => 0)).resolves.toEqual({
      accessToken: 'ghu_new',
      refreshToken: 'ghr_new',
      expiresAt: 28_800_000,
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: 'Iv1.test',
      client_secret: 'shh',
      grant_type: 'refresh_token',
      refresh_token: 'ghr_old',
    });
  });

  it('leaves out the client secret when the app has none', async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(json({ access_token: 'ghu_new' }));
    await refreshTokens({ fetch, clientId: 'Iv1.test', userAgent: 'Plot/test' }, 'ghr_old');
    expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toContain('client_secret');
  });

  it('asks to sign in again when GitHub refuses the refresh token', async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(json({ error: 'bad_refresh_token' }));
    await expect(
      refreshTokens({ fetch, clientId: 'Iv1.test', userAgent: 'Plot/test' }, 'ghr_used'),
    ).rejects.toMatchObject({ code: 'github-unauthorized' });
  });
});
