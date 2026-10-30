import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import {
  APP_ORIGIN,
  confineNavigation,
  denyPermissionRequests,
  registerAppScheme,
  serveRenderer,
} from './security';

registerAppScheme();

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  confineNavigation(window.webContents, devServerUrl ?? APP_ORIGIN);
  window.once('ready-to-show', () => window.show());
  void window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  denyPermissionRequests();
  serveRenderer(join(__dirname, '../renderer'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
