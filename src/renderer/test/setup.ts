import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { initializePreferences } from '../src/lib/preferences';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement modal dialogs.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

// jsdom does not implement popovers.
function setPopoverOpen(element: HTMLElement, open: boolean) {
  if (element.hasAttribute('data-popover-open') === open) {
    return;
  }
  element.toggleAttribute('data-popover-open', open);
  element.dispatchEvent(Object.assign(new Event('toggle'), { newState: open ? 'open' : 'closed' }));
}
HTMLElement.prototype.showPopover ??= function showPopover(this: HTMLElement) {
  setPopoverOpen(this, true);
};
HTMLElement.prototype.hidePopover ??= function hidePopover(this: HTMLElement) {
  setPopoverOpen(this, false);
};
const popoverStyle = document.createElement('style');
popoverStyle.textContent = '[popover][data-popover-open] { display: block !important; }';
document.head.append(popoverStyle);

// jsdom does not implement font loading.
class TestFontFace {
  status: FontFaceLoadStatus = 'unloaded';

  constructor(
    readonly family: string,
    readonly source: string | BufferSource,
    readonly descriptors: FontFaceDescriptors = {},
  ) {}

  get weight() {
    return this.descriptors.weight ?? 'normal';
  }

  get style() {
    return this.descriptors.style ?? 'normal';
  }

  load() {
    this.status = 'loaded';
    return Promise.resolve(this);
  }
}
class TestFontFaceSet extends Set<FontFace> {
  ready = Promise.resolve(this);
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
  load() {
    return Promise.resolve([]);
  }
}
globalThis.FontFace ??= TestFontFace as unknown as typeof FontFace;
globalThis.FontFaceSetLoadEvent ??= class extends Event {
  readonly fontfaces: readonly FontFace[];

  constructor(type: string, init: FontFaceSetLoadEventInit = {}) {
    super(type);
    this.fontfaces = init.fontfaces ?? [];
  }
};
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', { value: new TestFontFaceSet() });
}

afterEach(() => {
  cleanup();
  initializePreferences({}, () => {});
  document.fonts.clear();
});
