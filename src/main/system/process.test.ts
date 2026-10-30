import { describe, expect, it } from 'vitest';
import { CommandError, runCommand } from './process';

const node = process.execPath;

describe('runCommand', () => {
  it('returns stdout and stderr of a successful command', async () => {
    const result = await runCommand(node, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err")',
    ]);
    expect(result).toEqual({ stdout: 'out', stderr: 'err' });
  });

  it('passes arguments without a shell, so metacharacters stay literal', async () => {
    const result = await runCommand(node, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '$(echo injected); rm -rf /',
    ]);
    expect(result.stdout).toBe('$(echo injected); rm -rf /');
  });

  it('runs in the given working directory', async () => {
    const result = await runCommand(node, ['-e', 'process.stdout.write(process.cwd())'], {
      cwd: '/',
    });
    expect(result.stdout).toBe('/');
  });

  it('reports a non-zero exit with its code and stderr', async () => {
    const error = await runCommand(node, [
      '-e',
      'process.stderr.write("bad input"); process.exit(3)',
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({ failure: 'exit', exitCode: 3, stderr: 'bad input' });
  });

  it('reports a missing executable as not-found', async () => {
    const error = await runCommand('viewer-command-that-does-not-exist', []).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ failure: 'not-found' });
  });

  it('kills commands that run past the timeout', async () => {
    const error = await runCommand(node, ['-e', 'setTimeout(() => {}, 10000)'], {
      timeoutMs: 100,
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ failure: 'timeout' });
  });
});
