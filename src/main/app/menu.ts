import type { MenuCommand } from '@shared/ipc';
import type { MenuItemConstructorOptions } from 'electron';

export const PROJECT_URL = 'https://github.com/gentledev10/viewer';

interface ApplicationMenuOptions {
  appName: string;
  isDevelopment: boolean;
  send(command: MenuCommand): void;
  openExternal(url: string): void;
}

export function applicationMenu({
  appName,
  isDevelopment,
  send,
  openExternal,
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const development: MenuItemConstructorOptions[] = isDevelopment
    ? [{ role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }]
    : [];
  return [
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
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...development,
        { role: 'resetZoom' },
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
      ],
    },
  ];
}
