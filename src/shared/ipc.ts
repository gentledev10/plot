import type { Account, AccountList, BrowserSignIn, TokenSignIn } from './accounts';
import type { AiModelOption, AiProviderId, AiProviderStatus, AiSettings } from './ai';
import type { ThemeSource } from './appearance';
import type { BlobContent, PullRequestDiff } from './diff';
import type { ErrorPayload } from './errors';
import type { AddedFont, InstalledFont } from './fonts';
import type {
  Inbox,
  PullRequestDetail,
  PullRequestPage,
  PullRequestRef,
  PullRequestSummary,
  RepositoryPullRequestQuery,
  RepositoryRef,
} from './github';
import type { LocalDiff, LocalRepository, LocalStatus, LocalTarget } from './local';
import type { ReviewStatus } from './review';
import type {
  ReviewActivity,
  ReviewQuestionRequest,
  ReviewVerificationRequest,
} from './review-activity';

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
  listAccessibleRepositories(): Promise<RepositoryRef[]>;
  findRepository(ref: RepositoryRef): Promise<RepositoryRef>;
  countOpenPullRequests(ref: RepositoryRef): Promise<number>;
  listRepositoryPullRequests(query: RepositoryPullRequestQuery): Promise<PullRequestPage>;
  getPullRequestDiff(ref: PullRequestRef): Promise<PullRequestDiff>;
  readBlob(ref: PullRequestRef, blob: string): Promise<BlobContent>;
  getReviewStatus(ref: PullRequestRef): Promise<ReviewStatus>;
  startReview(ref: PullRequestRef): Promise<void>;
  cancelReview(ref: PullRequestRef): Promise<void>;
  getReviewActivity(ref: PullRequestRef): Promise<ReviewActivity>;
  askReview(ref: PullRequestRef, request: ReviewQuestionRequest): Promise<void>;
  verifyReview(ref: PullRequestRef, request: ReviewVerificationRequest): Promise<void>;
  cancelReviewActivity(ref: PullRequestRef, kind: 'question' | 'verification'): Promise<void>;
  getAiSettings(): Promise<AiSettings>;
  updateAiSettings(settings: AiSettings): Promise<AiSettings>;
  detectAiProviders(): Promise<AiProviderStatus[]>;
  listAiModels(provider: AiProviderId): Promise<AiModelOption[]>;
  saveAiApiKey(provider: AiProviderId, key: string): Promise<void>;
  removeAiApiKey(provider: AiProviderId): Promise<void>;
  setThemeSource(source: ThemeSource): Promise<void>;
  listInstalledFonts(): Promise<InstalledFont[]>;
  listAddedFonts(): Promise<AddedFont[]>;
  addFonts(): Promise<AddedFont[]>;
  readAddedFont(id: string): Promise<Uint8Array<ArrayBuffer>>;
  removeAddedFont(family: string): Promise<void>;
  getPreferences(): Promise<Record<string, unknown>>;
  setPreference(key: string, value: unknown): Promise<void>;
  openLocalRepository(): Promise<LocalRepository | null>;
  listLocalRepositories(): Promise<LocalRepository[]>;
  removeLocalRepository(id: string): Promise<void>;
  getLocalStatus(repositoryId: string): Promise<LocalStatus>;
  findLocalPullRequest(repositoryId: string): Promise<PullRequestSummary | null>;
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
  listAccessibleRepositories: true,
  findRepository: true,
  countOpenPullRequests: true,
  listRepositoryPullRequests: true,
  getPullRequestDiff: true,
  readBlob: true,
  getReviewStatus: true,
  startReview: true,
  cancelReview: true,
  getReviewActivity: true,
  askReview: true,
  verifyReview: true,
  cancelReviewActivity: true,
  getAiSettings: true,
  updateAiSettings: true,
  detectAiProviders: true,
  listAiModels: true,
  saveAiApiKey: true,
  removeAiApiKey: true,
  setThemeSource: true,
  listInstalledFonts: true,
  listAddedFonts: true,
  addFonts: true,
  readAddedFont: true,
  removeAddedFont: true,
  getPreferences: true,
  setPreference: true,
  openLocalRepository: true,
  listLocalRepositories: true,
  removeLocalRepository: true,
  getLocalStatus: true,
  findLocalPullRequest: true,
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
