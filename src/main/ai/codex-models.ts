import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { AppError } from '../errors';
import type { Spawn } from './agent';

interface CatalogOptions {
  apiKey?: string;
  command?: readonly string[];
  env?: NodeJS.ProcessEnv;
  spawnProcess?: Spawn;
  timeoutMs?: number;
}

export async function queryCodexModels({
  apiKey,
  command = ['codex'],
  env = process.env,
  spawnProcess = spawn,
  timeoutMs = 15_000,
}: CatalogOptions = {}): Promise<unknown[]> {
  const home = apiKey ? await mkdtemp(join(tmpdir(), 'plot-models-')) : undefined;
  const [executable = '', ...prefix] = command;
  const child = spawnProcess(
    executable,
    [
      ...prefix,
      'app-server',
      '--config',
      'model_provider="openai"',
      '--config',
      'cli_auth_credentials_store="file"',
    ],
    { env: home ? { ...env, CODEX_HOME: home } : env, stdio: ['pipe', 'pipe', 'ignore'] },
  );
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let sequence = 0;
  let failure: Error | undefined;
  const fail = (message: string) => {
    failure = new AppError('ai-not-configured', message);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  };
  const timer = setTimeout(() => {
    fail('Could not load available Codex models. Check your Codex sign-in and try again.');
    child.kill('SIGTERM');
  }, timeoutMs);
  const lines = child.stdout ? createInterface({ input: child.stdout }) : undefined;
  lines?.on('line', (line) => {
    let message: { id?: number; result?: unknown; error?: unknown };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== 'number') return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error)
      request.reject(
        new AppError(
          'ai-not-configured',
          'Codex could not load the models for this sign-in. Update Codex or check the selected API key.',
        ),
      );
    else request.resolve(message.result);
  });
  child.on('error', () =>
    fail('Could not start Codex. Install or update Codex, then check the installed tools again.'),
  );
  child.stdin?.on('error', () =>
    fail('Could not communicate with Codex. Update Codex and try again.'),
  );
  child.on('close', () =>
    fail('Codex stopped while loading models. Check your sign-in or update Codex.'),
  );
  const request = (method: string, params: object): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      child.stdin?.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  try {
    await request('initialize', { clientInfo: { name: 'plot', version: '0.1.0' } });
    child.stdin?.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    if (apiKey) await request('account/login/start', { type: 'apiKey', apiKey });
    const account = (await request('account/read', { refreshToken: false })) as {
      account?: { type?: string };
    };
    const models: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = (await request('model/list', {
        limit: 100,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      })) as { data?: unknown; nextCursor?: unknown };
      if (!Array.isArray(page?.data))
        throw new AppError(
          'ai-not-configured',
          'Codex returned an unreadable model list. Update Codex and try again.',
        );
      models.push(...page.data);
      const next = typeof page.nextCursor === 'string' ? page.nextCursor : undefined;
      if (next && next === cursor)
        throw new AppError('ai-not-configured', 'Codex could not finish loading its model list.');
      cursor = next;
    } while (cursor && models.length < 1_000);
    if (account.account?.type === 'chatgpt') {
      // Older clients can return their bundled catalog after these ChatGPT models retired.
      const retired = new Set([
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.3-codex',
        'gpt-5.2',
        'gpt-5.3-codex-spark',
      ]);
      const available = models.filter(
        (entry) => !retired.has((entry as { model?: string }).model ?? ''),
      );
      if (models.length > 0 && available.length === 0) {
        throw new AppError(
          'ai-not-configured',
          'Your installed Codex returned only retired models for ChatGPT sign-in. Update Codex, then reload models.',
        );
      }
      return available;
    }
    return models;
  } finally {
    clearTimeout(timer);
    lines?.close();
    const closed = new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once('close', () => resolve());
      child.kill('SIGTERM');
      const kill = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1_000);
      kill.unref();
      child.once('close', () => clearTimeout(kill));
    });
    await closed;
    if (home) await rm(home, { recursive: true, force: true });
  }
}
