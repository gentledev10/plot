import { IPC_METHODS, type ViewerApi } from '@shared/ipc';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors';
import { argumentParsers } from './arguments';
import { type InvokeEvent, type IpcMainLike, registerIpcHandlers } from './register';

type Listener = Parameters<IpcMainLike['handle']>[1];

function setup(api: Partial<ViewerApi> = {}) {
  const listeners = new Map<string, Listener>();
  const ipc: IpcMainLike = { handle: (channel, listener) => listeners.set(channel, listener) };
  const onUnexpectedError = vi.fn();
  const fullApi: ViewerApi = {
    listAccounts: vi.fn().mockResolvedValue({ accounts: [], browserSignIn: false }),
    switchAccount: vi.fn(),
    removeAccount: vi.fn(),
    signInWithToken: vi.fn(),
    signInWithGitHubCli: vi.fn(),
    startBrowserSignIn: vi.fn(),
    finishBrowserSignIn: vi.fn(),
    cancelBrowserSignIn: vi.fn(),
    listInbox: vi.fn().mockResolvedValue({ reviewRequested: [], authored: [] }),
    getPullRequest: vi.fn(),
    getPullRequestDiff: vi.fn(),
    readBlob: vi.fn(),
    getReviewStatus: vi.fn(),
    startReview: vi.fn(),
    cancelReview: vi.fn(),
    ...api,
  };
  registerIpcHandlers(ipc, fullApi, {
    parsers: argumentParsers,
    isTrustedSender: (url) => url.startsWith('app://viewer/'),
    onUnexpectedError,
  });

  const fromApp: InvokeEvent = { senderFrame: { url: 'app://viewer/index.html' } };
  function invoke(channel: string, event: InvokeEvent, ...args: unknown[]) {
    const listener = listeners.get(channel);
    if (!listener) {
      throw new Error(`No handler for ${channel}`);
    }
    return listener(event, ...args);
  }
  return { listeners, invoke, fromApp, api: fullApi, onUnexpectedError };
}

const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };

describe('registerIpcHandlers', () => {
  it('registers a channel for every API method', () => {
    const { listeners } = setup();
    expect([...listeners.keys()].sort()).toEqual(IPC_METHODS.map((m) => `viewer:${m}`).sort());
  });

  it('wraps results in an ok response', async () => {
    const { invoke, fromApp } = setup();
    await expect(invoke('viewer:listAccounts', fromApp)).resolves.toEqual({
      ok: true,
      value: { accounts: [], browserSignIn: false },
    });
  });

  it('passes validated arguments to the API', async () => {
    const getPullRequest = vi.fn().mockResolvedValue({ title: 'ok' });
    const { invoke, fromApp } = setup({ getPullRequest });

    await invoke('viewer:getPullRequest', fromApp, { ...ref, extra: 'ignored' });
    expect(getPullRequest).toHaveBeenCalledWith(ref);
  });

  it('rejects malformed arguments before they reach the API', async () => {
    const getPullRequest = vi.fn();
    const { invoke, fromApp } = setup({ getPullRequest });

    const response = await invoke('viewer:getPullRequest', fromApp, { ...ref, repo: '../etc' });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-argument' } });
    expect(getPullRequest).not.toHaveBeenCalled();
  });

  it('refuses requests from frames outside the app', async () => {
    const { invoke, api } = setup();

    await expect(
      invoke('viewer:listAccounts', { senderFrame: { url: 'https://evil.example/' } }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'forbidden' } });
    await expect(invoke('viewer:listAccounts', { senderFrame: null })).resolves.toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(api.listAccounts).not.toHaveBeenCalled();
  });

  it('returns app errors as they are', async () => {
    const { invoke, fromApp, onUnexpectedError } = setup({
      listInbox: vi.fn().mockRejectedValue(new AppError('network', 'Offline.')),
    });
    await expect(invoke('viewer:listInbox', fromApp)).resolves.toEqual({
      ok: false,
      error: { code: 'network', message: 'Offline.' },
    });
    expect(onUnexpectedError).not.toHaveBeenCalled();
  });

  it('reports unexpected errors and hides their details', async () => {
    const failure = new TypeError('cannot read properties of undefined');
    const { invoke, fromApp, onUnexpectedError } = setup({
      listInbox: vi.fn().mockRejectedValue(failure),
    });

    const response = await invoke('viewer:listInbox', fromApp);
    expect(response).toMatchObject({ ok: false, error: { code: 'unknown' } });
    expect(JSON.stringify(response)).not.toContain('undefined');
    expect(onUnexpectedError).toHaveBeenCalledWith('listInbox', failure);
  });
});
