import { join } from 'node:path';
import type { AiProviderId } from '@shared/ai';
import { MENU_COMMAND_CHANNEL, type MenuCommand, type PlotApi } from '@shared/ipc';
import {
  appLanguage,
  LANGUAGE_PREFERENCE,
  type Language,
  parseLanguages,
  reviewLanguage,
  SYSTEM_LOCALE_PREFERENCE,
} from '@shared/language';
import { parseReviewPlan, REVIEW_PLAN_PREFERENCE } from '@shared/review-plan';
import { createTranslator } from '@shared/translations';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, shell } from 'electron';
import { createAccountStore } from './accounts/account-store';
import type { ReviewAgent } from './ai/agent';
import { createAiSettingsStore } from './ai/ai-settings-store';
import { apiKeyFor, createApiKeyStore } from './ai/api-key-store';
import { createClaudeCodeAgent } from './ai/claude-code';
import { createCodexAgent } from './ai/codex';
import { requireRestrictedMode } from './ai/compatibility';
import { detectProvider } from './ai/detect';
import { listAiModels } from './ai/models';
import { createReviewActivityStore } from './ai/review-activity-store';
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
import { AppError } from './errors';
import { createFontLibrary } from './fonts/font-library';
import { listInstalledFonts } from './fonts/installed-fonts';
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
import { createFontService } from './services/font-service';
import { createGitHubService, openPullRequestFinder } from './services/github-service';
import { createLocalReviewService } from './services/local-review-service';
import { createLocalService } from './services/local-service';
import { createReviewActivityService } from './services/review-activity-service';
import { createReviewExecutionService } from './services/review-execution-service';
import { createReviewService } from './services/review-service';
import { runCommand, runCommandForBuffer } from './system/process';
import { createReviewRuntime } from './system/review-runtime';
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
  const ai = createAiService({
    store: aiSettings,
    keys: apiKeys,
    detect: (id) => detectProvider(runCommand, id),
    async listModels(id) {
      const settings = { ...(await aiSettings.read()), provider: id };
      return listAiModels(id, { apiKey: await apiKeyFor(apiKeys, settings) });
    },
  });
  const reviewStore = createFileReviewStore(join(userData, 'reviews'));
  const resolveReviewAgent = async () => {
    const settings = await ai.getAiSettings();
    const { provider } = settings;
    const apiKey = await apiKeyFor(apiKeys, settings);
    if (provider === 'claude-code') {
      const status = await detectProvider(runCommand, provider);
      requireRestrictedMode(status.version ?? '');
    }
    let model = settings.models[provider];
    if (provider === 'codex') {
      const models = await listAiModels(provider, { apiKey });
      if (model && !models.some((option) => option.id === model)) {
        throw new AppError(
          'ai-not-configured',
          'This model is not available for your selected sign-in. Choose another model in Settings > AI overview.',
        );
      }
      model ??= models.find((option) => option.isDefault)?.id ?? models[0]?.id;
      if (!model)
        throw new AppError(
          'ai-not-configured',
          'No Codex models are available. Check your sign-in in Settings > AI overview.',
        );
    }
    return {
      provider,
      model,
      effort: settings.efforts[provider],
      apiKey,
      agent: agents[provider],
    };
  };
  const reviews = createReviewService({
    connections,
    repositories,
    resolveAgent: resolveReviewAgent,
    store: reviewStore,
    workspaceRoot: join(userData, 'review-workspaces'),
    plan: async () => parseReviewPlan((await preferences.all())[REVIEW_PLAN_PREFERENCE]),
    language: async () =>
      reviewLanguage(
        parseLanguages((await preferences.all())[LANGUAGE_PREFERENCE]),
        systemLocale(),
      ),
    onUnexpectedError: (error) => console.error('[review] failed', error),
  });
  const local = createLocalService({
    repositories: createLocalRepositoryStore(join(userData, 'local-repositories.json')),
    git: createLocalGit({ run: runCommand, runForBuffer: runCommandForBuffer, env: process.env }),
    chooseFolder: chooseRepositoryFolder,
    findOpenPullRequest: openPullRequestFinder(connections),
  });
  const reviewActivities = createReviewActivityService({
    connections,
    repositories,
    reviews: reviewStore,
    store: createReviewActivityStore(join(userData, 'review-activities')),
    workspaceRoot: join(userData, 'review-activity-workspaces'),
    resolveAgent: resolveReviewAgent,
    language: async () =>
      reviewLanguage(
        parseLanguages((await preferences.all())[LANGUAGE_PREFERENCE]),
        systemLocale(),
      ),
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
    ...reviewActivities,
    ...createReviewExecutionService({
      connections,
      repositories,
      reviews: reviewStore,
      runtime: createReviewRuntime(),
      root: join(userData, 'review-executions'),
      language: async () =>
        reviewLanguage(
          parseLanguages((await preferences.all())[LANGUAGE_PREFERENCE]),
          systemLocale(),
        ),
    }),
    ...ai,
    async setThemeSource(source) {
      nativeTheme.themeSource = source;
      await writeThemeSource(appearanceFile(), source);
    },
    ...createFontService({
      library: createFontLibrary(join(userData, 'fonts')),
      chooseFiles: chooseFontFiles,
      listInstalled: () => listInstalledFonts(runCommand),
    }),
    getPreferences: async () => ({
      ...(await preferences.all()),
      [SYSTEM_LOCALE_PREFERENCE]: systemLocale(),
    }),
    setPreference: async (key, value) => {
      await preferences.set(key, value);
      if (key === LANGUAGE_PREFERENCE)
        installMenu(appLanguage(parseLanguages(value), systemLocale()));
    },
    ...local,
    ...createLocalReviewService({
      local,
      resolveAgent: resolveReviewAgent,
      workspaceRoot: join(userData, 'local-review-workspaces'),
      cacheRoot: join(userData, 'local-reviews'),
      plan: async () => parseReviewPlan((await preferences.all())[REVIEW_PLAN_PREFERENCE]),
      language: async () =>
        reviewLanguage(
          parseLanguages((await preferences.all())[LANGUAGE_PREFERENCE]),
          systemLocale(),
        ),
    }),
  };
}

function systemLocale(): string {
  return app.getPreferredSystemLanguages()[0] ?? app.getLocale();
}

async function choosePaths(options: Electron.OpenDialogOptions): Promise<string[]> {
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

async function chooseRepositoryFolder(): Promise<string | undefined> {
  const [folder] = await choosePaths({
    title: createTranslator(mainLanguage)('Open a Local Repository'),
    buttonLabel: createTranslator(mainLanguage)('Open'),
    properties: ['openDirectory'],
  });
  return folder;
}

function chooseFontFiles(): Promise<string[]> {
  return choosePaths({
    title: createTranslator(mainLanguage)('Add Fonts'),
    buttonLabel: createTranslator(mainLanguage)('Add'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: createTranslator(mainLanguage)('Fonts'), extensions: ['ttf', 'otf'] }],
  });
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
  if (!app.isPackaged) {
    app.dock?.setIcon(join(__dirname, '../../build/icon.png'));
  }
  if (app.isPackaged) {
    await adoptLoginShellPath();
  }
  denyPermissionRequests();
  nativeTheme.themeSource = await readThemeSource(appearanceFile());
  const savedPreferences = await createPreferencesStore(
    join(app.getPath('userData'), 'preferences.json'),
  ).all();
  installMenu(appLanguage(parseLanguages(savedPreferences[LANGUAGE_PREFERENCE]), systemLocale()));
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

let mainLanguage: Language = 'en';
function installMenu(language: Language): void {
  mainLanguage = language;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      applicationMenu({
        appName: app.name,
        language,
        isDevelopment: !app.isPackaged,
        send: sendMenuCommand,
        openExternal: (url) => void shell.openExternal(url),
        resetZoom: () => BrowserWindow.getFocusedWindow()?.webContents.setZoomLevel(0),
        openLicenses: () => {
          void shell.openPath(
            app.isPackaged
              ? join(process.resourcesPath, 'THIRD_PARTY_LICENSES.txt')
              : join(__dirname, '../renderer/THIRD_PARTY_LICENSES.txt'),
          );
        },
      }),
    ),
  );
}
