import { AppError } from '../errors';
import {
  ACCESS_TOKEN_URL,
  type OAuthClient,
  type OAuthResponse,
  type OAuthTokens,
  parseTokens,
  postForm,
  refusedSignIn,
} from './oauth';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const MAX_NETWORK_FAILURES = 3;

export interface DeviceCodeGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export async function requestDeviceCode(
  client: OAuthClient,
  scopes: readonly string[],
): Promise<DeviceCodeGrant> {
  const body = await postForm(client, DEVICE_CODE_URL, {
    client_id: client.clientId,
    scope: scopes.join(' '),
  });
  if (typeof body.error === 'string') {
    throw refusedSignIn(body);
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
  client: OAuthClient,
  grant: DeviceCodeGrant,
  { signal, sleep = abortableSleep, now = Date.now }: WaitOptions,
): Promise<OAuthTokens> {
  const deadline = now() + grant.expiresInSeconds * 1_000;
  let interval = grant.intervalSeconds;
  let networkFailures = 0;

  while (now() < deadline) {
    await sleep(interval * 1_000, signal).catch(() => {
      throw cancelled();
    });
    let body: OAuthResponse;
    try {
      body = await postForm(client, ACCESS_TOKEN_URL, {
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
    const tokens = parseTokens(body, now());
    if (tokens) {
      return tokens;
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
        throw refusedSignIn(body);
    }
  }
  throw expired();
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
