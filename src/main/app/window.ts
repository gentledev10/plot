import { BrowserWindow, nativeTheme } from 'electron';
import { confineNavigation } from './security';

interface MainWindowOptions {
  preloadPath: string;
  url: string;
  origin: string;
}

export function createMainWindow({ preloadPath, url, origin }: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#ffffff',
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  confineNavigation(window.webContents, origin);
  window.once('ready-to-show', () => window.show());
  void window.loadURL(url);
  return window;
}
