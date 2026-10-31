import { pathToFileURL } from 'node:url';
import { net, protocol, session, shell, type WebContents } from 'electron';
import { isWithinOrigin, resolveRendererFile } from './navigation';

const SCHEME = 'app';
export const APP_ORIGIN = `${SCHEME}://viewer`;

// Pull request text and AI output are rendered in this window, so no remote script may run.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export function serveRenderer(rendererDir: string): void {
  protocol.handle(SCHEME, async (request) => {
    const filePath = resolveRendererFile(rendererDir, request.url);
    if (!filePath) {
      return new Response(null, { status: 404 });
    }
    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    return new Response(response.body, { status: response.status, headers });
  });
}

export function denyPermissionRequests(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  );
}

export function confineNavigation(contents: WebContents, origin: string): void {
  contents.on('will-navigate', (event, url) => {
    if (!isWithinOrigin(url, origin)) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}
