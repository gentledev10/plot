import type { AiProviderId, AiProviderStatus } from '@shared/ai';
import { CommandError, type CommandRunner } from '../system/process';

const COMMANDS: Record<AiProviderId, string> = { 'claude-code': 'claude', codex: 'codex' };

const SIGN_IN_CHECKS: Record<AiProviderId, readonly string[]> = {
  'claude-code': ['auth', 'status', '--json'],
  codex: ['login', 'status'],
};

const TIMEOUT_MS = 10_000;

export async function detectProvider(
  run: CommandRunner,
  id: AiProviderId,
): Promise<AiProviderStatus> {
  const command = COMMANDS[id];
  let version: string | undefined;
  try {
    const { stdout } = await run(command, ['--version'], { timeoutMs: TIMEOUT_MS });
    version = stdout.trim().split('\n')[0] || undefined;
  } catch (error) {
    return { id, installed: !(error instanceof CommandError && error.failure === 'not-found') };
  }
  return { id, installed: true, version, signedIn: await isSignedIn(run, id) };
}

async function isSignedIn(run: CommandRunner, id: AiProviderId): Promise<boolean | undefined> {
  let stdout: string;
  try {
    ({ stdout } = await run(COMMANDS[id], SIGN_IN_CHECKS[id], { timeoutMs: TIMEOUT_MS }));
  } catch (error) {
    return error instanceof CommandError && error.failure === 'exit' ? false : undefined;
  }
  if (id === 'codex') {
    return true;
  }
  try {
    const status = JSON.parse(stdout) as { loggedIn?: unknown };
    return typeof status.loggedIn === 'boolean' ? status.loggedIn : undefined;
  } catch {
    return undefined;
  }
}
