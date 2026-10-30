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

export function sizedAvatarUrl(url: string, pixels: number): string {
  try {
    const sized = new URL(url);
    sized.searchParams.set('s', String(pixels));
    return sized.toString();
  } catch {
    return url;
  }
}
