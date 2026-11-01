import { AppError } from '../errors';
import type { Fetch } from './client';

export const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface OAuthClient {
  fetch: Fetch;
  clientId: string;
  clientSecret?: string;
  userAgent: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
}

export type OAuthResponse = Record<string, unknown>;

export async function postForm(
  client: OAuthClient,
  url: string,
  form: Record<string, string>,
): Promise<OAuthResponse> {
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
    return (await response.json()) as OAuthResponse;
  } catch (error) {
    throw new AppError('sign-in-failed', `GitHub answered the sign-in with ${response.status}.`, {
      cause: error,
    });
  }
}

export function parseTokens(body: OAuthResponse, now: number): OAuthTokens | undefined {
  const { access_token, refresh_token, expires_in, refresh_token_expires_in } = body;
  if (typeof access_token !== 'string' || access_token === '') {
    return undefined;
  }
  const tokens: OAuthTokens = { accessToken: access_token };
  if (typeof refresh_token === 'string' && refresh_token !== '') {
    tokens.refreshToken = refresh_token;
  }
  const lifetime = seconds(expires_in);
  if (lifetime !== undefined) {
    tokens.expiresAt = now + lifetime * 1_000;
  }
  const refreshLifetime = seconds(refresh_token_expires_in);
  if (refreshLifetime !== undefined) {
    tokens.refreshTokenExpiresAt = now + refreshLifetime * 1_000;
  }
  return tokens;
}

export function refusedSignIn(body: OAuthResponse): AppError {
  const reason = typeof body.error_description === 'string' ? body.error_description : body.error;
  return new AppError('sign-in-failed', `GitHub refused the sign-in: ${String(reason)}`);
}

export function signInExpired(): AppError {
  return new AppError(
    'github-unauthorized',
    'Your GitHub sign-in has expired. Sign in again in Settings > Accounts.',
  );
}

export async function refreshTokens(
  client: OAuthClient,
  refreshToken: string,
  now: () => number = Date.now,
): Promise<OAuthTokens> {
  const body = await postForm(client, ACCESS_TOKEN_URL, {
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const tokens = parseTokens(body, now());
  if (!tokens) {
    throw signInExpired();
  }
  return tokens;
}

function seconds(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : undefined;
}
