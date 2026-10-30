import type { ErrorCode } from '@shared/errors';
import {
  IPC_METHODS,
  type IpcMethod,
  type IpcResponse,
  type ViewerApi,
  type ViewerBridge,
} from '@shared/ipc';

export class ViewerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ViewerError';
  }
}

type BridgeMethod = (...args: unknown[]) => Promise<IpcResponse<unknown>>;

export function createApi(bridge: ViewerBridge): ViewerApi {
  const entries = IPC_METHODS.map((method: IpcMethod) => {
    const call = bridge[method] as BridgeMethod;
    const unwrapped = async (...args: unknown[]) => {
      const response = await call(...args);
      if (!response.ok) {
        throw new ViewerError(response.error.code, response.error.message);
      }
      return response.value;
    };
    return [method, unwrapped] as const;
  });
  return Object.fromEntries(entries) as unknown as ViewerApi;
}

const PERMANENT_ERRORS: ReadonlySet<ErrorCode> = new Set([
  'invalid-argument',
  'forbidden',
  'gh-not-installed',
  'gh-not-authenticated',
  'github-unauthorized',
  'github-sso-required',
  'github-not-found',
  'github-rate-limited',
]);

export function isRetryable(error: unknown): boolean {
  return !(error instanceof ViewerError && PERMANENT_ERRORS.has(error.code));
}
