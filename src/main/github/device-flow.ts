import { AppError } from '../errors';
import type { Fetch } from './client';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const MAX_NETWORK_FAILURES = 3;

export interface DeviceCodeGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

interface DeviceFlowClient {
  fetch: Fetch;
  clientId: string;
  userAgent: string;
}

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

type Json = Record<string, unknown>;

export async function requestDeviceCode(
  client: DeviceFlowClient,
  scopes: readonly string[],
): Promise<DeviceCodeGrant> {
  const body = await post(client, DEVICE_CODE_URL, {
    client_id: client.clientId,
    scope: scopes.join(' '),
  });
  if (typeof body.error === 'string') {
    throw refused(body);
  }
  const { device_code, user_code, verification_uri, expires_in, interval } = body;
  if (
    typeof device_code !== 'string' ||
    typeof user_code !== 'string' ||
    typeof verification_uri !== 'string' ||
    !verification_uri.startsWith('https://') ||
    typeof expires_in !== 'number' ||
    typeof interval !== 'number'
  ) {
    throw new AppError('sign-in-failed', 'GitHub returned an unexpected sign-in code.');
  }
  return {
    deviceCode: device_code,
    userCode: user_code,
    verificationUri: verification_uri,
    expiresInSeconds: expires_in,
    intervalSeconds: interval,
  };
}

interface WaitOptions {
  signal: AbortSignal;
  sleep?: Sleep;
  now?(): number;
}

export async function waitForAccessToken(
  client: DeviceFlowClient,
  grant: DeviceCodeGrant,
  { signal, sleep = abortableSleep, now = Date.now }: WaitOptions,
): Promise<string> {
  const deadline = now() + grant.expiresInSeconds * 1_000;
  let interval = grant.intervalSeconds;
  let networkFailures = 0;

  while (now() < deadline) {
    await sleep(interval * 1_000, signal).catch(() => {
      throw cancelled();
    });
    let body: Json;
    try {
      body = await post(client, ACCESS_TOKEN_URL, {
        client_id: client.clientId,
        device_code: grant.deviceCode,
        grant_type: DEVICE_GRANT,
      });
      networkFailures = 0;
    } catch (error) {
      networkFailures += 1;
      if (networkFailures >= MAX_NETWORK_FAILURES || signal.aborted) {
        throw error;
      }
      continue;
    }
    if (typeof body.access_token === 'string' && body.access_token !== '') {
      return body.access_token;
    }
    switch (body.error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        interval = typeof body.interval === 'number' ? body.interval : interval + 5;
        break;
      case 'expired_token':
        throw expired();
      case 'access_denied':
        throw new AppError('sign-in-failed', 'The sign-in was declined on GitHub.');
      default:
        throw refused(body);
    }
  }
  throw expired();
}

async function post(client: DeviceFlowClient, url: string, form: Record<string, string>) {
  let response: Response;
  try {
    response = await client.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': client.userAgent,
      },
      body: new URLSearchParams(form).toString(),
    });
  } catch (error) {
    throw new AppError('network', 'Could not reach github.com. Check your connection.', {
      cause: error,
    });
  }
  try {
    return (await response.json()) as Json;
  } catch (error) {
    throw new AppError('sign-in-failed', `GitHub answered the sign-in with ${response.status}.`, {
      cause: error,
    });
  }
}

function refused(body: Json): AppError {
  const reason = typeof body.error_description === 'string' ? body.error_description : body.error;
  return new AppError('sign-in-failed', `GitHub refused the sign-in: ${String(reason)}`);
}

function expired(): AppError {
  return new AppError('sign-in-failed', 'The sign-in code expired. Start again.');
}

function cancelled(): AppError {
  return new AppError('sign-in-cancelled', 'The sign-in was cancelled.');
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
