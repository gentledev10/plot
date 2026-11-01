import type { MenuCommand } from '@shared/ipc';
import type { Language } from '@shared/language';
import { createTranslator } from '@shared/translations';
import type { MenuItemConstructorOptions } from 'electron';

export const PROJECT_URL = 'https://github.com/gentledev10/plot';

interface ApplicationMenuOptions {
  appName: string;
  isDevelopment: boolean;
  send(command: MenuCommand): void;
  openExternal(url: string): void;
  resetZoom(): void;
  openLicenses?(): void;
  language?: Language;
}

export function applicationMenu({
  appName,
  isDevelopment,
  send,
  openExternal,
  resetZoom,
  openLicenses,
  language = 'en',
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const development: MenuItemConstructorOptions[] = isDevelopment
    ? [{ role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }]
    : [];
  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Open Local Repository…', click: () => send('open-local-repository') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      role: 'editMenu',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...development,
        // Without the role's ⌘0, which shows or hides local changes.
        { label: 'Actual Size', click: resetZoom },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('open-keymap') },
        { type: 'separator' },
        { label: 'Report an Issue', click: () => openExternal(`${PROJECT_URL}/issues/new`) },
        { label: 'Source Code', click: () => openExternal(PROJECT_URL) },
        { label: 'Open Source Licenses', click: openLicenses, enabled: openLicenses !== undefined },
      ],
    },
  ];
  const t = createTranslator(language);
  const roles: Record<string, string> = {
    about: t('About {value0}', { value0: appName }),
    services: 'Services',
    hide: 'Hide',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit',
    close: 'Close',
    editMenu: 'Edit',
    windowMenu: 'Window',
    help: 'Help',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    togglefullscreen: 'Toggle Full Screen',
    minimize: 'Minimize',
  };
  function localize(items: MenuItemConstructorOptions[]) {
    for (const item of items) {
      if (item.label) item.label = t(item.label);
      else if (item.role && roles[item.role]) item.label = t(roles[item.role] ?? item.role);
      if (Array.isArray(item.submenu)) localize(item.submenu);
    }
  }
  localize(template);
  return template;
}
