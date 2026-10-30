import { join } from 'node:path';
import type { ViewerApi } from '@shared/ipc';
import { app, BrowserWindow, ipcMain, net } from 'electron';
import { isWithinOrigin } from './app/navigation';
import {
  APP_ORIGIN,
  denyPermissionRequests,
  registerAppScheme,
  serveRenderer,
} from './app/security';
import { createMainWindow } from './app/window';
import { createGitHubClient } from './github/client';
import { createGhTokenProvider } from './github/token';
import { argumentParsers } from './ipc/arguments';
import { registerIpcHandlers } from './ipc/register';
import { createGitHubService } from './services/github-service';
import { runCommand } from './system/process';
import { mergePaths, resolveLoginShellPath } from './system/shell-env';

registerAppScheme();

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const origin = devServerUrl ?? APP_ORIGIN;

async function adoptLoginShellPath(): Promise<void> {
  const loginPath = await resolveLoginShellPath(runCommand, process.env.SHELL ?? '/bin/zsh');
  process.env.PATH = mergePaths(loginPath, process.env.PATH, '/opt/homebrew/bin:/usr/local/bin');
}

function createApi(): ViewerApi {
  const github = createGitHubClient({
    fetch: (url, init) => net.fetch(url, init),
    tokens: createGhTokenProvider(runCommand),
    userAgent: `Viewer/${app.getVersion()}`,
  });
  return { ...createGitHubService(github) };
}

function openWindow(): void {
  createMainWindow({
    preloadPath: join(__dirname, '../preload/index.js'),
    url: devServerUrl ?? `${APP_ORIGIN}/index.html`,
    origin,
  });
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    await adoptLoginShellPath();
  }
  denyPermissionRequests();
  serveRenderer(join(__dirname, '../renderer'));
  registerIpcHandlers(ipcMain, createApi(), {
    parsers: argumentParsers,
    isTrustedSender: (url) => isWithinOrigin(url, origin),
    onUnexpectedError: (method, error) => console.error(`[ipc] ${method} failed`, error),
  });
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
