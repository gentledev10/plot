import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import {
  APP_ORIGIN,
  denyPermissionRequests,
  registerAppScheme,
  serveRenderer,
} from './app/security';
import { createMainWindow } from './app/window';

registerAppScheme();

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const origin = devServerUrl ?? APP_ORIGIN;

function openWindow(): void {
  createMainWindow({
    preloadPath: join(__dirname, '../preload/index.js'),
    url: devServerUrl ?? `${APP_ORIGIN}/index.html`,
    origin,
  });
}

app.whenReady().then(() => {
  denyPermissionRequests();
  serveRenderer(join(__dirname, '../renderer'));
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
