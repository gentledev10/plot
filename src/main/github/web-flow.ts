import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppError } from '../errors';
import {
  ACCESS_TOKEN_URL,
  type OAuthClient,
  type OAuthTokens,
  parseTokens,
  postForm,
  refusedSignIn,
} from './oauth';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const CALLBACK_PATH = '/callback';
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export interface WebSignIn {
  authorizeUrl: string;
  tokens: Promise<OAuthTokens>;
  cancel(): void;
}

interface WebSignInOptions {
  timeoutMs?: number;
  now?(): number;
}

export async function startWebSignIn(
  client: OAuthClient & { clientSecret: string },
  scopes: readonly string[],
  { timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now }: WebSignInOptions = {},
): Promise<WebSignIn> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(16).toString('base64url');
  let settle!: { resolve(tokens: OAuthTokens): void; reject(error: Error): void };
  const tokens = new Promise<OAuthTokens>((resolve, reject) => {
    settle = { resolve, reject };
  });
  tokens.catch(() => {});

  let handled = false;
  let finished = false;
  const server = createServer((request, response) => void handle(request, response));
  await listen(server);
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const timer = setTimeout(
    () => finish(new AppError('sign-in-failed', 'The sign-in timed out. Start again.')),
    timeoutMs,
  );

  function finish(result: OAuthTokens | Error) {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timer);
    server.close();
    if (result instanceof Error) {
      settle.reject(result);
    } else {
      settle.resolve(result);
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', redirectUri);
    if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
      respond(response, 404, 'There is nothing here.');
      return;
    }
    if (url.searchParams.get('state') !== state || handled || finished) {
      respond(response, 400, 'This sign-in link is not the one Plot is waiting for.');
      return;
    }
    handled = true;
    const error = url.searchParams.get('error');
    if (error === 'access_denied') {
      respond(response, 200, 'You declined the sign-in. You can close this tab.');
      finish(new AppError('sign-in-failed', 'The sign-in was declined on GitHub.'));
      return;
    }
    const code = url.searchParams.get('code');
    if (error || !code) {
      respond(response, 200, 'GitHub could not finish the sign-in. Go back to Plot and try again.');
      finish(refusedSignIn(Object.fromEntries(url.searchParams)));
      return;
    }
    try {
      const body = await postForm(client, ACCESS_TOKEN_URL, {
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      const received = parseTokens(body, now());
      if (!received) {
        throw refusedSignIn(body);
      }
      respond(response, 200, 'Plot is connected to GitHub. You can close this tab.');
      finish(received);
    } catch (failure) {
      respond(response, 200, 'Plot could not finish signing in. Go back to Plot and try again.');
      finish(failure instanceof Error ? failure : new Error(String(failure)));
    }
  }

  const query = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return {
    authorizeUrl: `${AUTHORIZE_URL}?${query}`,
    tokens,
    cancel: () => finish(new AppError('sign-in-cancelled', 'The sign-in was cancelled.')),
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function respond(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Referrer-Policy': 'no-referrer',
    Connection: 'close',
  });
  response.end(page(message));
}

function page(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plot</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 28rem; padding: 24px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 20px; }
</style>
</head>
<body><main><h1>Plot</h1><p>${message}</p></main></body>
</html>`;
}
