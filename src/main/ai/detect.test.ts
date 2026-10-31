import { describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandRunner } from '../system/process';
import { detectProvider } from './detect';

function runner(responses: Record<string, string | CommandError>) {
  return vi.fn<CommandRunner>(async (command, args) => {
    const response = responses[[command, ...args].join(' ')];
    if (response === undefined) {
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    }
    if (response instanceof CommandError) {
      throw response;
    }
    return { stdout: response, stderr: '' };
  });
}

describe('detectProvider', () => {
  it('reports the Claude Code version and sign-in, without exposing account details', async () => {
    const run = runner({
      'claude --version': '2.1.314 (Claude Code)\n',
      'claude auth status --json': JSON.stringify({ loggedIn: true, email: 'mona@example.com' }),
    });
    await expect(detectProvider(run, 'claude-code')).resolves.toEqual({
      id: 'claude-code',
      installed: true,
      version: '2.1.314 (Claude Code)',
      signedIn: true,
    });
  });

  it('reports a signed-out Codex CLI', async () => {
    const run = runner({
      'codex --version': 'codex-cli 0.166.0\n',
      'codex login status': new CommandError('exit', 'codex', 'Not logged in', 1),
    });
    await expect(detectProvider(run, 'codex')).resolves.toEqual({
      id: 'codex',
      installed: true,
      version: 'codex-cli 0.166.0',
      signedIn: false,
    });
  });

  it('reports a CLI that is not installed', async () => {
    const run = runner({ 'codex --version': new CommandError('not-found', 'codex', '') });
    await expect(detectProvider(run, 'codex')).resolves.toEqual({ id: 'codex', installed: false });
  });

  it('leaves the sign-in unknown when the CLI cannot tell', async () => {
    const run = runner({
      'claude --version': '2.0.0 (Claude Code)',
      'claude auth status --json': 'not json',
    });
    await expect(detectProvider(run, 'claude-code')).resolves.toMatchObject({
      installed: true,
      signedIn: undefined,
    });
  });
});
