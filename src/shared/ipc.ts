import type { Account, AccountList, BrowserSignIn, TokenSignIn } from './accounts';
import type { BlobContent, PullRequestDiff } from './diff';
import type { ErrorPayload } from './errors';
import type { Inbox, PullRequestDetail, PullRequestRef } from './github';
import type { ReviewStatus } from './review';

export interface ViewerApi {
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
}

export type IpcMethod = keyof ViewerApi;

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
};

export const IPC_METHODS = Object.keys(METHODS) as readonly IpcMethod[];

export function ipcChannel(method: IpcMethod): string {
  return `viewer:${method}`;
}

export type IpcResponse<T> = { ok: true; value: T } | { ok: false; error: ErrorPayload };

const MENU_COMMANDS = { 'open-settings': true, 'open-keymap': true } as const;

export type MenuCommand = keyof typeof MENU_COMMANDS;

export const MENU_COMMAND_CHANNEL = 'viewer:menu-command';

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && Object.hasOwn(MENU_COMMANDS, value);
}

export type MenuCommandListener = (command: MenuCommand) => void;

export type ViewerBridge = {
  readonly platform: string;
  onMenuCommand(listener: MenuCommandListener): () => void;
} & {
  [K in IpcMethod]: (
    ...args: Parameters<ViewerApi[K]>
  ) => Promise<IpcResponse<Awaited<ReturnType<ViewerApi[K]>>>>;
};
