import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, parseLayout, toggleAllPanels, togglePanel } from './panels';

describe('togglePanel', () => {
  it('flips one panel and leaves the other alone', () => {
    expect(togglePanel(DEFAULT_LAYOUT, 'sidebar')).toEqual({ sidebar: false, review: true });
    expect(togglePanel({ sidebar: false, review: true }, 'sidebar')).toEqual(DEFAULT_LAYOUT);
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
