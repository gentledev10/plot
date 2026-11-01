import { describe, expect, it, vi } from 'vitest';
import type { Fetch } from './client';
import { type DeviceCodeGrant, requestDeviceCode, waitForAccessToken } from './device-flow';

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const fetch = vi.fn<Fetch>();
  for (const response of responses) {
    if (response instanceof Error) {
      fetch.mockRejectedValueOnce(response);
    } else {
      fetch.mockResolvedValueOnce(response);
    }
  }
  return fetch;
}

const client = (fetch: Fetch) => ({ fetch, clientId: 'Iv1.test', userAgent: 'Plot/test' });

const grant: DeviceCodeGrant = {
  deviceCode: 'device-123',
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresInSeconds: 900,
  intervalSeconds: 5,
};

function clock() {
  let time = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => time,
    sleep: async (ms: number, signal: AbortSignal) => {
      if (signal.aborted) {
        throw signal.reason;
      }
      waits.push(ms);
      time += ms;
    },
  };
}

describe('requestDeviceCode', () => {
  it('asks GitHub for a code with the app id and scopes', async () => {
    const fetch = fakeFetch(
      json({
        device_code: 'device-123',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      }),
    );

    await expect(requestDeviceCode(client(fetch), ['repo'])).resolves.toEqual(grant);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://github.com/login/device/code');
    expect(init?.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: 'Iv1.test',
      scope: 'repo',
    });
  });

  it('explains why GitHub refused to start', async () => {
    const fetch = fakeFetch(
      json({ error: 'device_flow_disabled', error_description: 'Device Flow must be enabled' }),
    );
    await expect(requestDeviceCode(client(fetch), ['repo'])).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('Device Flow must be enabled'),
    });
  });

  it('does not accept a verification page outside https', async () => {
    const fetch = fakeFetch(
      json({
        device_code: 'd',
        user_code: 'u',
        verification_uri: 'javascript:alert(1)',
        expires_in: 900,
        interval: 5,
      }),
    );
    await expect(requestDeviceCode(client(fetch), ['repo'])).rejects.toMatchObject({
      code: 'sign-in-failed',
    });
  });
});

describe('waitForAccessToken', () => {
  const signal = new AbortController().signal;

  it('polls at the interval GitHub asked for until the user approves', async () => {
    const fetch = fakeFetch(
      json({ error: 'authorization_pending' }),
      json({ error: 'slow_down', interval: 10 }),
      json({
        access_token: 'gho_new',
        token_type: 'bearer',
        scope: 'repo',
        refresh_token: 'ghr_new',
        expires_in: 28_800,
      }),
    );
    const time = clock();

    await expect(waitForAccessToken(client(fetch), grant, { signal, ...time })).resolves.toEqual({
      accessToken: 'gho_new',
      refreshToken: 'ghr_new',
      expiresAt: 20_000 + 28_800_000,
    });
    expect(time.waits).toEqual([5_000, 5_000, 10_000]);
    expect(Object.fromEntries(new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body)))).toEqual(
      {
        client_id: 'Iv1.test',
        device_code: 'device-123',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
    );
  });

  it('stops when the user declines or the code expires', async () => {
    await expect(
      waitForAccessToken(client(fakeFetch(json({ error: 'access_denied' }))), grant, {
        signal,
        ...clock(),
      }),
    ).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('declined'),
    });

    await expect(
      waitForAccessToken(client(fakeFetch(json({ error: 'expired_token' }))), grant, {
        signal,
        ...clock(),
      }),
    ).rejects.toMatchObject({
      code: 'sign-in-failed',
      message: expect.stringContaining('expired'),
    });
  });

  it('gives up at the deadline even if GitHub keeps saying pending', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockImplementation(async () => json({ error: 'authorization_pending' }));
    const shortGrant = { ...grant, expiresInSeconds: 12 };

    await expect(
      waitForAccessToken(client(fetch), shortGrant, { signal, ...clock() }),
    ).rejects.toMatchObject({ message: expect.stringContaining('expired') });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rides out a brief network failure', async () => {
    const fetch = fakeFetch(new Error('offline'), json({ access_token: 'gho_new' }));
    await expect(waitForAccessToken(client(fetch), grant, { signal, ...clock() })).resolves.toEqual(
      { accessToken: 'gho_new' },
    );
  });

  it('reports cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForAccessToken(client(fakeFetch()), grant, { signal: controller.signal, ...clock() }),
    ).rejects.toMatchObject({ code: 'sign-in-cancelled' });
  });
});
