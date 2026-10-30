import { isAbsolute, join, normalize, relative } from 'node:path';

export function isWithinOrigin(url: string, origin: string): boolean {
  return url === origin || url.startsWith(`${origin}/`);
}

export function resolveRendererFile(rendererDir: string, requestUrl: string): string | undefined {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return undefined;
  }
  const filePath = normalize(join(rendererDir, pathname));
  const fromRoot = relative(rendererDir, filePath);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    return undefined;
  }
  return filePath;
}
