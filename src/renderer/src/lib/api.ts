import type { ErrorCode } from '@shared/errors';
import {
  IPC_METHODS,
  type IpcMethod,
  type IpcResponse,
  type PlotApi,
  type PlotBridge,
} from '@shared/ipc';

export class PlotError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlotError';
  }
}

type BridgeMethod = (...args: unknown[]) => Promise<IpcResponse<unknown>>;

export function createApi(bridge: PlotBridge): PlotApi {
  const entries = IPC_METHODS.map((method: IpcMethod) => {
    const call = bridge[method] as BridgeMethod;
    const unwrapped = async (...args: unknown[]) => {
      const response = await call(...args);
      if (!response.ok) {
        throw new PlotError(response.error.code, response.error.message);
      }
      return response.value;
    };
    return [method, unwrapped] as const;
  });
  return Object.fromEntries(entries) as unknown as PlotApi;
}

const PERMANENT_ERRORS: ReadonlySet<ErrorCode> = new Set([
  'invalid-argument',
  'forbidden',
  'github-no-account',
  'sign-in-failed',
  'sign-in-cancelled',
  'secure-storage-unavailable',
  'gh-not-installed',
  'gh-not-authenticated',
  'github-unauthorized',
  'github-sso-required',
  'github-not-found',
  'github-rate-limited',
]);

export function isRetryable(error: unknown): boolean {
  return !(error instanceof PlotError && PERMANENT_ERRORS.has(error.code));
}
