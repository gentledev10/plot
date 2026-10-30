import { describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandRunner } from './process';
import { extractMarkedPath, mergePaths, resolveLoginShellPath } from './shell-env';

describe('extractMarkedPath', () => {
  it('ignores anything a noisy shell profile prints around the value', () => {
    const output = 'Welcome back!\n__VIEWER_PATH__/opt/homebrew/bin:/usr/bin__VIEWER_PATH__\nbye';
    expect(extractMarkedPath(output)).toBe('/opt/homebrew/bin:/usr/bin');
  });

  it('returns undefined when the markers are missing or the value is empty', () => {
    expect(extractMarkedPath('/usr/bin')).toBeUndefined();
    expect(extractMarkedPath('__VIEWER_PATH__/usr/bin')).toBeUndefined();
    expect(extractMarkedPath('__VIEWER_PATH____VIEWER_PATH__')).toBeUndefined();
  });
});

describe('resolveLoginShellPath', () => {
  it('asks an interactive login shell for PATH', async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValue({
      stdout: '__VIEWER_PATH__/opt/homebrew/bin:/usr/bin__VIEWER_PATH__',
      stderr: '',
    });

    await expect(resolveLoginShellPath(run, '/bin/zsh')).resolves.toBe(
      '/opt/homebrew/bin:/usr/bin',
    );
    expect(run).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-ilc', expect.stringContaining('"$PATH"')],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('gives up quietly when the shell fails', async () => {
    const run = vi.fn<CommandRunner>().mockRejectedValue(new CommandError('timeout', 'zsh', ''));
    await expect(resolveLoginShellPath(run, '/bin/zsh')).resolves.toBeUndefined();
  });

  it('works with a real shell', async () => {
    const { runCommand } = await import('./process');
    const path = await resolveLoginShellPath(runCommand, '/bin/sh');
    expect(path).toContain('/');
  });
});

describe('mergePaths', () => {
  it('keeps the first occurrence of each directory in order', () => {
    expect(mergePaths('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin', '/opt/homebrew/bin')).toBe(
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
  });

  it('skips missing and empty entries', () => {
    expect(mergePaths(undefined, '/usr/bin::/bin', '')).toBe('/usr/bin:/bin');
  });
});
