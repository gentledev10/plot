import type { Account, AccountList, BrowserSignIn, TokenSignIn } from './accounts';
import type { AiProviderId, AiProviderStatus, AiSettings } from './ai';
import type { ThemeSource } from './appearance';
import type { BlobContent, PullRequestDiff } from './diff';
import type { ErrorPayload } from './errors';
import type { Inbox, PullRequestDetail, PullRequestRef } from './github';
import type { LocalDiff, LocalRepository, LocalStatus, LocalTarget } from './local';
import type { ReviewStatus } from './review';

export interface PlotApi {
  listAccounts(): Promise<AccountList>;
  switchAccount(id: string): Promise<void>;
  removeAccount(id: string): Promise<void>;
  signInWithToken(input: TokenSignIn): Promise<Account>;
  signInWithGitHubCli(host: string): Promise<Account>;
  startBrowserSignIn(): Promise<BrowserSignIn>;
  finishBrowserSignIn(id: string): Promise<Account>;
  cancelBrowserSignIn(id: string): Promise<void>;
  listInbox(): Promise<Inbox>;
  getPullRequest(ref: PullRequestRef): Promise<PullRequestDetail>;
  getPullRequestDiff(ref: PullRequestRef): Promise<PullRequestDiff>;
  readBlob(ref: PullRequestRef, blob: string): Promise<BlobContent>;
  getReviewStatus(ref: PullRequestRef): Promise<ReviewStatus>;
  startReview(ref: PullRequestRef): Promise<void>;
  cancelReview(ref: PullRequestRef): Promise<void>;
  getAiSettings(): Promise<AiSettings>;
  updateAiSettings(settings: AiSettings): Promise<AiSettings>;
  detectAiProviders(): Promise<AiProviderStatus[]>;
  saveAiApiKey(provider: AiProviderId, key: string): Promise<void>;
  removeAiApiKey(provider: AiProviderId): Promise<void>;
  setThemeSource(source: ThemeSource): Promise<void>;
  getPreferences(): Promise<Record<string, unknown>>;
  setPreference(key: string, value: unknown): Promise<void>;
  openLocalRepository(): Promise<LocalRepository | null>;
  listLocalRepositories(): Promise<LocalRepository[]>;
  removeLocalRepository(id: string): Promise<void>;
  getLocalStatus(repositoryId: string): Promise<LocalStatus>;
  getLocalDiff(target: LocalTarget): Promise<LocalDiff>;
  getLocalSignature(target: LocalTarget): Promise<string>;
  readLocalBlob(repositoryId: string, blob: string): Promise<BlobContent>;
  readLocalFile(repositoryId: string, path: string): Promise<BlobContent>;
}

export type IpcMethod = keyof PlotApi;

const METHODS: Record<IpcMethod, true> = {
  listAccounts: true,
  switchAccount: true,
  removeAccount: true,
  signInWithToken: true,
  signInWithGitHubCli: true,
  startBrowserSignIn: true,
  finishBrowserSignIn: true,
  cancelBrowserSignIn: true,
  listInbox: true,
  getPullRequest: true,
  getPullRequestDiff: true,
  readBlob: true,
  getReviewStatus: true,
  startReview: true,
  cancelReview: true,
  getAiSettings: true,
  updateAiSettings: true,
  detectAiProviders: true,
  saveAiApiKey: true,
  removeAiApiKey: true,
  setThemeSource: true,
  getPreferences: true,
  setPreference: true,
  openLocalRepository: true,
  listLocalRepositories: true,
  removeLocalRepository: true,
  getLocalStatus: true,
  getLocalDiff: true,
  getLocalSignature: true,
  readLocalBlob: true,
  readLocalFile: true,
};

export const IPC_METHODS = Object.keys(METHODS) as readonly IpcMethod[];

export function ipcChannel(method: IpcMethod): string {
  return `plot:${method}`;
}

export type IpcResponse<T> = { ok: true; value: T } | { ok: false; error: ErrorPayload };

const MENU_COMMANDS = {
  'open-settings': true,
  'open-keymap': true,
  'open-local-repository': true,
} as const;

export type MenuCommand = keyof typeof MENU_COMMANDS;

export const MENU_COMMAND_CHANNEL = 'plot:menu-command';

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && Object.hasOwn(MENU_COMMANDS, value);
}

export type MenuCommandListener = (command: MenuCommand) => void;

export type PlotBridge = {
  readonly platform: string;
  onMenuCommand(listener: MenuCommandListener): () => void;
} & {
  [K in IpcMethod]: (
    ...args: Parameters<PlotApi[K]>
  ) => Promise<IpcResponse<Awaited<ReturnType<PlotApi[K]>>>>;
};
