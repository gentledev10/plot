import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  fitPanels,
  parseLayout,
  parseToolWindow,
  toggleAllPanels,
  togglePanel,
  toggleToolWindow,
} from './panels';

describe('fitPanels', () => {
  it('preserves a readable workspace even when stored panel sizes are too large', () => {
    const result = fitPanels(1440, { sidebar: 640, review: 1000 }, DEFAULT_LAYOUT);
    expect(result.sizes.sidebar + result.sizes.review).toBeLessThanOrEqual(1440 - 72 - 480);
  });
  it('shows the explicitly requested panel on a narrow window and restores both when wide', () => {
    const sizes = { sidebar: 300, review: 360 };
    expect(fitPanels(960, sizes, DEFAULT_LAYOUT).layout).toEqual({ sidebar: true, review: false });
    expect(fitPanels(960, sizes, DEFAULT_LAYOUT, 'review').layout).toEqual({
      sidebar: false,
      review: true,
    });
    expect(fitPanels(1440, sizes, DEFAULT_LAYOUT).layout).toEqual(DEFAULT_LAYOUT);
  });
});

describe('togglePanel', () => {
  it('flips one panel and leaves the other alone', () => {
    expect(togglePanel(DEFAULT_LAYOUT, 'sidebar')).toEqual({ sidebar: false, review: true });
    expect(togglePanel({ sidebar: false, review: true }, 'sidebar')).toEqual(DEFAULT_LAYOUT);
  });
});

describe('toggleToolWindow', () => {
  it('brings another tool window forward without hiding the sidebar', () => {
    expect(
      toggleToolWindow({ layout: DEFAULT_LAYOUT, window: 'pull-requests' }, 'local-changes'),
    ).toEqual({ layout: DEFAULT_LAYOUT, window: 'local-changes' });
  });

  it('hides the sidebar when its tool window is already showing', () => {
    expect(
      toggleToolWindow({ layout: DEFAULT_LAYOUT, window: 'local-changes' }, 'local-changes'),
    ).toEqual({ layout: { sidebar: false, review: true }, window: 'local-changes' });
  });

  it('shows a hidden sidebar with the tool window that was asked for', () => {
    expect(
      toggleToolWindow(
        { layout: { sidebar: false, review: false }, window: 'local-changes' },
        'pull-requests',
      ),
    ).toEqual({ layout: { sidebar: true, review: false }, window: 'pull-requests' });
  });
});

describe('parseToolWindow', () => {
  it('accepts a known tool window and rejects anything else', () => {
    expect(parseToolWindow('local-changes')).toBe('local-changes');
    expect(parseToolWindow('repositories')).toBeUndefined();
    expect(parseToolWindow(1)).toBeUndefined();
  });
});

describe('toggleAllPanels', () => {
  it('hides every panel and remembers what was open', () => {
    expect(toggleAllPanels({ sidebar: true, review: false }, undefined)).toEqual({
      layout: { sidebar: false, review: false },
      restore: { sidebar: true, review: false },
    });
  });

  it('brings back the panels that were open before', () => {
    expect(
      toggleAllPanels({ sidebar: false, review: false }, { sidebar: true, review: false }),
    ).toEqual({ layout: { sidebar: true, review: false } });
  });

  it('shows every panel when there is nothing to restore', () => {
    expect(toggleAllPanels({ sidebar: false, review: false }, undefined)).toEqual({
      layout: DEFAULT_LAYOUT,
    });
  });
});

describe('parseLayout', () => {
  it('accepts a stored layout', () => {
    expect(parseLayout({ sidebar: false, review: true })).toEqual({ sidebar: false, review: true });
  });

  it('rejects anything else', () => {
    expect(parseLayout(null)).toBeUndefined();
    expect(parseLayout('hidden')).toBeUndefined();
    expect(parseLayout({ sidebar: 'no', review: true })).toBeUndefined();
  });
});
