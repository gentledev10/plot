import { join } from 'node:path';
import { MENU_COMMAND_CHANNEL, type MenuCommand, type ViewerApi } from '@shared/ipc';
import { app, BrowserWindow, ipcMain, Menu, net, shell } from 'electron';
import { createClaudeCodeAgent } from './ai/claude-code';
import { languageName } from './ai/language';
import { createFileReviewStore } from './ai/review-store';
import { applicationMenu } from './app/menu';
import { isWithinOrigin } from './app/navigation';
import {
  APP_ORIGIN,
  denyPermissionRequests,
  registerAppScheme,
  serveRenderer,
} from './app/security';
import { createMainWindow } from './app/window';
import { basicAuthHeader } from './git/environment';
import { createRepositoryCache } from './git/repository-cache';
import { createGitHubClient } from './github/client';
import { createGhTokenProvider } from './github/token';
import { argumentParsers } from './ipc/arguments';
import { registerIpcHandlers } from './ipc/register';
import { createDiffService } from './services/diff-service';
import { createGitHubService } from './services/github-service';
import { createReviewService } from './services/review-service';
import { runCommand, runCommandForBuffer } from './system/process';
import { mergePaths, resolveLoginShellPath } from './system/shell-env';

registerAppScheme();

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const origin = devServerUrl ?? APP_ORIGIN;

async function adoptLoginShellPath(): Promise<void> {
  const loginPath = await resolveLoginShellPath(runCommand, process.env.SHELL ?? '/bin/zsh');
  process.env.PATH = mergePaths(loginPath, process.env.PATH, '/opt/homebrew/bin:/usr/local/bin');
}

function createApi(): ViewerApi {
  const tokens = createGhTokenProvider(runCommand);
  const github = createGitHubClient({
    fetch: (url, init) => net.fetch(url, init),
    tokens,
    userAgent: `Viewer/${app.getVersion()}`,
  });
  const repositories = createRepositoryCache({
    rootDir: join(app.getPath('userData'), 'repositories'),
    run: runCommand,
    runForBuffer: runCommandForBuffer,
    env: process.env,
    authHeader: async () => basicAuthHeader(await tokens.getToken()),
  });
  const userData = app.getPath('userData');
  const reviews = createReviewService({
    github,
    repositories,
    agent: createClaudeCodeAgent(),
    store: createFileReviewStore(join(userData, 'reviews')),
    workspaceRoot: join(userData, 'review-workspaces'),
    language: languageName(app.getLocale()),
    onUnexpectedError: (error) => console.error('[review] failed', error),
  });
  return {
    ...createGitHubService(github),
    ...createDiffService({ github, repositories }),
    ...reviews,
  };
}

function sendMenuCommand(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (window) {
    window.webContents.send(MENU_COMMAND_CHANNEL, command);
  } else {
    openWindow();
  }
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
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      applicationMenu({
        appName: app.name,
        isDevelopment: !app.isPackaged,
        send: sendMenuCommand,
        openExternal: (url) => void shell.openExternal(url),
      }),
    ),
  );
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
