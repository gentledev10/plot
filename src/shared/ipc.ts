import type { ErrorPayload } from './errors';
import type { Inbox, PullRequestDetail, PullRequestRef, Session } from './github';

export interface ViewerApi {
  getSession(): Promise<Session>;
  listInbox(): Promise<Inbox>;
  getPullRequest(ref: PullRequestRef): Promise<PullRequestDetail>;
}

export type IpcMethod = keyof ViewerApi;

const METHODS: Record<IpcMethod, true> = {
  getSession: true,
  listInbox: true,
  getPullRequest: true,
};

export const IPC_METHODS = Object.keys(METHODS) as readonly IpcMethod[];

export function ipcChannel(method: IpcMethod): string {
  return `viewer:${method}`;
}

export type IpcResponse<T> = { ok: true; value: T } | { ok: false; error: ErrorPayload };

export type ViewerBridge = { readonly platform: string } & {
  [K in IpcMethod]: (
    ...args: Parameters<ViewerApi[K]>
  ) => Promise<IpcResponse<Awaited<ReturnType<ViewerApi[K]>>>>;
};
