import type { IpcResponse, PlotApi } from '@shared/ipc';
import { IPC_METHODS, type IpcMethod, ipcChannel } from '@shared/ipc';
import { AppError, toErrorPayload } from '../errors';
import type { ArgumentParsers } from './arguments';

export interface InvokeEvent {
  senderFrame: { url: string } | null;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: InvokeEvent, ...args: unknown[]) => Promise<IpcResponse<unknown>>,
  ): void;
}

export interface RegisterOptions {
  parsers: ArgumentParsers;
  isTrustedSender(url: string): boolean;
  onUnexpectedError(method: IpcMethod, error: unknown): void;
}

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

export function registerIpcHandlers(
  ipc: IpcMainLike,
  api: PlotApi,
  { parsers, isTrustedSender, onUnexpectedError }: RegisterOptions,
): void {
  for (const method of IPC_METHODS) {
    ipc.handle(ipcChannel(method), async (event, ...args) => {
      try {
        const sender = event.senderFrame?.url;
        if (sender === undefined || !isTrustedSender(sender)) {
          throw new AppError('forbidden', 'This request did not come from the Plot window.');
        }
        const parsed = parsers[method](args) as unknown[];
        const value = await (api[method] as AnyMethod)(...parsed);
        return { ok: true, value };
      } catch (error) {
        if (!(error instanceof AppError)) {
          onUnexpectedError(method, error);
        }
        return { ok: false, error: toErrorPayload(error) };
      }
    });
  }
}
