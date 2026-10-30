import { describe, expect, it } from 'vitest';
import { formatRelativeTime, sizedAvatarUrl } from './format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-30T12:00:00Z');

  it.each([
    ['2026-10-30T11:59:30Z', 'now'],
    ['2026-10-30T11:55:00Z', '5m'],
    ['2026-10-30T09:00:00Z', '3h'],
    ['2026-10-28T12:00:00Z', '2d'],
    ['2026-10-01T12:00:00Z', '29d'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('switches to a date after a month', () => {
    expect(formatRelativeTime('2026-08-04T12:00:00Z', now)).toBe('Aug 4');
  });

  it('adds the year for dates in another year', () => {
    expect(formatRelativeTime('2025-12-24T12:00:00Z', now)).toBe('Dec 24, 2025');
  });

  it('treats clock skew from the server as now', () => {
    expect(formatRelativeTime('2026-10-30T12:00:05Z', now)).toBe('now');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});

describe('sizedAvatarUrl', () => {
  it('adds or replaces the size parameter', () => {
    expect(sizedAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4', 40)).toBe(
      'https://avatars.githubusercontent.com/u/1?v=4&s=40',
    );
    expect(sizedAvatarUrl('https://avatars.githubusercontent.com/u/1?s=460', 40)).toBe(
      'https://avatars.githubusercontent.com/u/1?s=40',
    );
  });

  it('leaves unparsable URLs alone', () => {
    expect(sizedAvatarUrl('not a url', 40)).toBe('not a url');
  });
});
