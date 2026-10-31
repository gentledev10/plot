import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { applicationMenu, PROJECT_URL } from './menu';

function items(menu: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return menu.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu) : []),
  ]);
}

function build(isDevelopment = false) {
  const send = vi.fn();
  const openExternal = vi.fn();
  const menu = applicationMenu({ appName: 'Viewer', isDevelopment, send, openExternal });
  const find = (label: string) => items(menu).find((item) => item.label === label);
  const click = (label: string) =>
    (find(label)?.click as (() => void) | undefined)?.call(undefined);
  return { menu, send, openExternal, find, click };
}

describe('applicationMenu', () => {
  it('opens settings with the standard macOS shortcut', () => {
    const { find, click, send } = build();
    expect(find('Settings…')?.accelerator).toBe('CmdOrCtrl+,');
    click('Settings…');
    expect(send).toHaveBeenCalledWith('open-settings');
  });

  it('opens a local repository from the File menu', () => {
    const { click, send } = build();
    click('Open Local Repository…');
    expect(send).toHaveBeenCalledWith('open-local-repository');
  });

  it('lists the keyboard shortcuts under Help', () => {
    const { click, send } = build();
    click('Keyboard Shortcuts');
    expect(send).toHaveBeenCalledWith('open-keymap');
  });

  it('links to the project for bug reports', () => {
    const { click, openExternal } = build();
    click('Report an Issue');
    expect(openExternal).toHaveBeenCalledWith(`${PROJECT_URL}/issues/new`);
  });

  it('keeps the developer tools out of the packaged app', () => {
    const roles = (isDevelopment: boolean) =>
      items(build(isDevelopment).menu).map((item) => item.role);
    expect(roles(true)).toContain('toggleDevTools');
    expect(roles(false)).not.toContain('toggleDevTools');
    expect(roles(false)).not.toContain('reload');
  });
});
