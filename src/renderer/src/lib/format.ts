const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (Number.isNaN(elapsed)) {
    return '';
  }
  if (elapsed < MINUTE) {
    return 'now';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`;
  }
  if (elapsed < 30 * DAY) {
    return `${Math.floor(elapsed / DAY)}d`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatAge(iso: string, now: Date = new Date()): string {
  const relative = formatRelativeTime(iso, now);
  if (relative === 'now') {
    return 'just now';
  }
  return /^\d+[mhd]$/.test(relative) ? `${relative} ago` : `on ${relative}`;
}

export function sizedAvatarUrl(url: string, pixels: number): string {
  try {
    const sized = new URL(url);
    sized.searchParams.set('s', String(pixels));
    return sized.toString();
  } catch {
    return url;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
