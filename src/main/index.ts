import { join } from 'node:path';
import type { AiProviderId } from '@shared/ai';
import { MENU_COMMAND_CHANNEL, type MenuCommand, type PlotApi } from '@shared/ipc';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, shell } from 'electron';
import { createAccountStore } from './accounts/account-store';
import type { ReviewAgent } from './ai/agent';
import { createAiSettingsStore } from './ai/ai-settings-store';
import { apiKeyFor, createApiKeyStore } from './ai/api-key-store';
import { createClaudeCodeAgent } from './ai/claude-code';
import { createCodexAgent } from './ai/codex';
import { detectProvider } from './ai/detect';
import { languageName } from './ai/language';
import { createFileReviewStore } from './ai/review-store';
import { keychainCipher } from './app/keychain';
import { applicationMenu } from './app/menu';
import { isWithinOrigin } from './app/navigation';
import {
  APP_ORIGIN,
  denyPermissionRequests,
  registerAppScheme,
  serveRenderer,
} from './app/security';
import { readThemeSource, writeThemeSource } from './app/theme-source';
import { createMainWindow } from './app/window';
import { basicAuthHeader } from './git/environment';
import { createRepositoryCache } from './git/repository-cache';
import { createGitHubClient } from './github/client';
import { createConnections } from './github/connections';
import { type OAuthClient, refreshTokens } from './github/oauth';
import { GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET } from './github/oauth-app';
import { createGhTokenProvider, storedTokens, type TokenProvider } from './github/token';
import { argumentParsers } from './ipc/arguments';
import { registerIpcHandlers } from './ipc/register';
import { createLocalGit } from './local/local-git';
import { createLocalRepositoryStore } from './local/local-repositories';
import { createPreferencesStore } from './preferences/preferences-store';
import { createAccountService } from './services/account-service';
import { createAiService } from './services/ai-service';
import { createDiffService } from './services/diff-service';
import { createGitHubService } from './services/github-service';
import { createLocalService } from './services/local-service';
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

function createApi(): PlotApi {
  const userData = app.getPath('userData');
  const userAgent = `Plot/${app.getVersion()}`;
  const fetch = (url: string, init: RequestInit) => net.fetch(url, init);
  const clientFor = (host: string, tokens: TokenProvider) =>
    createGitHubClient({ fetch, tokens, userAgent, host });
  const oauthApp: OAuthClient | undefined = GITHUB_OAUTH_CLIENT_ID
    ? {
        fetch,
        clientId: GITHUB_OAUTH_CLIENT_ID,
        clientSecret: GITHUB_OAUTH_CLIENT_SECRET,
        userAgent,
      }
    : undefined;

  const accounts = createAccountStore({
    file: join(userData, 'accounts.json'),
    cipher: keychainCipher,
  });
  const connections = createConnections({
    store: accounts,
    connect(account) {
      const tokens =
        account.method === 'github-cli'
          ? createGhTokenProvider(runCommand, { host: account.host, user: account.login })
          : storedTokens({
              read: () => accounts.readTokens(account.id),
              save: (fresh) => accounts.saveTokens(account.id, fresh),
              refresh: oauthApp
                ? (refreshToken) => refreshTokens(oauthApp, refreshToken)
                : undefined,
            });
      return {
        account,
        client: clientFor(account.host, tokens),
        authHeader: async () => basicAuthHeader(await tokens.getToken()),
      };
    },
  });
  const repositories = createRepositoryCache({
    rootDir: join(userData, 'repositories'),
    run: runCommand,
    runForBuffer: runCommandForBuffer,
    env: process.env,
    authHeader: async (repository) => (await connections.forHost(repository.host)).authHeader(),
  });
  const aiSettings = createAiSettingsStore(join(userData, 'ai-settings.json'));
  const apiKeys = createApiKeyStore({
    file: join(userData, 'ai-api-keys.json'),
    cipher: keychainCipher,
  });
  const preferences = createPreferencesStore(join(userData, 'preferences.json'));
  const agents: Record<AiProviderId, ReviewAgent> = {
    'claude-code': createClaudeCodeAgent(),
    codex: createCodexAgent(),
  };
  const reviews = createReviewService({
    connections,
    repositories,
    async resolveAgent() {
      const settings = await aiSettings.read();
      const { provider } = settings;
      return {
        provider,
        model: settings.models[provider],
        apiKey: await apiKeyFor(apiKeys, settings),
        agent: agents[provider],
      };
    },
    store: createFileReviewStore(join(userData, 'reviews')),
    workspaceRoot: join(userData, 'review-workspaces'),
    language: languageName(app.getLocale()),
    onUnexpectedError: (error) => console.error('[review] failed', error),
  });
  return {
    ...createAccountService({
      store: accounts,
      connections,
      clientFor,
      gitHubCliTokens: (host) => createGhTokenProvider(runCommand, { host }),
      browserSignIn: oauthApp,
    }),
    ...createGitHubService(connections),
    ...createDiffService({ connections, repositories }),
    ...reviews,
    ...createAiService({
      store: aiSettings,
      keys: apiKeys,
      detect: (id) => detectProvider(runCommand, id),
    }),
    async setThemeSource(source) {
      nativeTheme.themeSource = source;
      await writeThemeSource(appearanceFile(), source);
    },
    getPreferences: () => preferences.all(),
    setPreference: (key, value) => preferences.set(key, value),
    ...createLocalService({
      repositories: createLocalRepositoryStore(join(userData, 'local-repositories.json')),
      git: createLocalGit({ run: runCommand, runForBuffer: runCommandForBuffer, env: process.env }),
      chooseFolder: chooseRepositoryFolder,
    }),
  };
}

async function chooseRepositoryFolder(): Promise<string | undefined> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open a Local Repository',
    buttonLabel: 'Open',
    properties: ['openDirectory'],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

function appearanceFile(): string {
  return join(app.getPath('userData'), 'appearance.json');
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
  nativeTheme.themeSource = await readThemeSource(appearanceFile());
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
