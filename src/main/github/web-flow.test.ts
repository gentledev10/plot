import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fetch } from './client';
import { startWebSignIn, type WebSignIn } from './web-flow';

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

const started: WebSignIn[] = [];

async function start(fetch: Fetch = vi.fn<Fetch>(), timeoutMs?: number) {
  const signIn = await startWebSignIn(
    { fetch, clientId: 'Ov23test', clientSecret: 'shh', userAgent: 'Plot/test' },
    ['repo'],
    { now: () => 1_000, timeoutMs },
  );
  started.push(signIn);
  const url = new URL(signIn.authorizeUrl);
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const returnFromGitHub = (params: Record<string, string>) =>
    globalThis.fetch(`${redirectUri}?${new URLSearchParams(params)}`);
  return { signIn, url, redirectUri, state, returnFromGitHub };
}

afterEach(() => {
  for (const signIn of started.splice(0)) {
    signIn.cancel();
  }
});

describe('startWebSignIn', () => {
  it('sends the person to GitHub with PKCE and a way back to this Mac', async () => {
    const { url, redirectUri, state } = await start();

    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Ov23test');
    expect(url.searchParams.get('scope')).toBe('repo');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(state).toMatch(/^[\w-]{22}$/);
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it('trades the code for tokens with the secret and the verifier behind the challenge', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        json({ access_token: 'gho_web', refresh_token: 'ghr_web', expires_in: 28_800 }),
      );
    const { signIn, url, redirectUri, state, returnFromGitHub } = await start(fetch);

    const page = await returnFromGitHub({ code: 'code-123', state });

    await expect(signIn.tokens).resolves.toEqual({
      accessToken: 'gho_web',
      refreshToken: 'ghr_web',
      expiresAt: 1_000 + 28_800_000,
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Plot is connected to GitHub');
    const [tokenUrl, init] = fetch.mock.calls[0] ?? [];
    expect(tokenUrl).toBe('https://github.com/login/oauth/access_token');
    const form = Object.fromEntries(new URLSearchParams(String(init?.body)));
    expect(form).toMatchObject({
      client_id: 'Ov23test',
      client_secret: 'shh',
      code: 'code-123',
      redirect_uri: redirectUri,
    });
    expect(
      createHash('sha256')
        .update(form.code_verifier ?? '')
        .digest('base64url'),
    ).toBe(url.searchParams.get('code_challenge'));
  });

  it('ignores a request that does not carry its state', async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(json({ access_token: 'gho_web' }));
    const { signIn, state, returnFromGitHub } = await start(fetch);

    const forged = await returnFromGitHub({ code: 'code-evil', state: 'not-the-state' });
    expect(forged.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();

    await returnFromGitHub({ code: 'code-123', state });
    await expect(signIn.tokens).resolves.toMatchObject({ accessToken: 'gho_web' });
  });

  it('reports a sign-in the person declined on GitHub', async () => {
    const { signIn, state, returnFromGitHub } = await start();

    const page = await returnFromGitHub({ error: 'access_denied', state });

    await expect(signIn.tokens).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('declined'),
    });
    expect(await page.text()).toContain('You declined the sign-in');
  });

  it('reports when GitHub refuses the code', async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(
      json({
        error: 'incorrect_client_credentials',
        error_description: 'The client_id and/or client_secret passed are incorrect.',
      }),
    );
    const { signIn, state, returnFromGitHub } = await start(fetch);

    const page = await returnFromGitHub({ code: 'code-123', state });

    await expect(signIn.tokens).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('client_secret'),
    });
    expect(await page.text()).toContain('could not finish signing in');
  });

  it('stops listening when the sign-in is cancelled', async () => {
    const { signIn, state, returnFromGitHub } = await start();

    signIn.cancel();

    await expect(signIn.tokens).rejects.toMatchObject({ code: 'sign-in-cancelled' });
    await expect(returnFromGitHub({ code: 'late', state })).rejects.toThrow();
  });

  it('gives up when nobody comes back in time', async () => {
    const { signIn } = await start(vi.fn<Fetch>(), 10);
    await expect(signIn.tokens).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('timed out'),
    });
  });
});
