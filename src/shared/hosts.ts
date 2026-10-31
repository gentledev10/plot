export const GITHUB_HOST = 'github.com';

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

export function isHost(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 253 && HOST.test(value);
}

export function normalizeHost(input: string): string | undefined {
  let host = input.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
  if (host === 'www.github.com' || host === 'api.github.com') {
    host = GITHUB_HOST;
  }
  return isHost(host) ? host : undefined;
}

export function apiBaseUrl(host: string): string {
  if (host === GITHUB_HOST) {
    return 'https://api.github.com';
  }
  if (host.endsWith('.ghe.com')) {
    return `https://api.${host}`;
  }
  return `https://${host}/api/v3`;
}
