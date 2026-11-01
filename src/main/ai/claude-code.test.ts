import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claudeArguments,
  createClaudeCodeAgent,
  describeToolUse,
  parseStreamLine,
  withApiKey,
} from './claude-code';

const fakeClaude = [process.execPath, join(__dirname, 'fixtures', 'fake-claude.mjs')];
let cwd: string;

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'plot-claude-'));
  await mkdir(join(cwd, 'src'));
});

afterAll(() => {});

function run(
  mode: string,
  options: { timeoutMs?: number; signal?: AbortSignal; apiKey?: string } = {},
) {
  const activity: string[] = [];
  const { ANTHROPIC_API_KEY: _fromShell, ...env } = process.env;
  const agent = createClaudeCodeAgent({
    command: fakeClaude,
    env: { ...env, FAKE_CLAUDE_MODE: mode },
    timeoutMs: options.timeoutMs,
  });
  const promise = agent.run({
    cwd,
    contextDir: '/tmp/context',
    prompt: 'Review this.',
    schema: { type: 'object' },
    apiKey: options.apiKey,
    signal: options.signal ?? new AbortController().signal,
    onActivity: (text) => activity.push(text),
  });
  return { promise, activity };
}

describe('claudeArguments', () => {
  const args = claudeArguments({ prompt: 'p', schema: { type: 'object' }, contextDir: '/ctx' });

  it('runs Claude Code headless with streaming, structured output', () => {
    expect(args.slice(0, 2)).toEqual(['--print', 'p']);
    expect(args).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '--verbose']));
    expect(args[args.indexOf('--json-schema') + 1]).toBe('{"type":"object"}');
  });

  it('allows only read-only tools and no MCP servers, settings, or saved sessions', () => {
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Grep,Glob');
    expect(args).toEqual(
      expect.arrayContaining(['--restricted', '--strict-mcp-config', '--no-session-persistence']),
    );
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk');
  });

  it('gives access to the context directory', () => {
    expect(args[args.indexOf('--add-dir') + 1]).toBe('/ctx');
  });

  it('passes the chosen model and effort as single tokens, and nothing when unset', () => {
    const chosen = claudeArguments({
      prompt: 'p',
      schema: {},
      contextDir: '/ctx',
      model: 'opus',
      effort: 'xhigh',
    });
    expect(chosen).toEqual(expect.arrayContaining(['--model=opus', '--effort=xhigh']));
    expect(args.some((arg) => arg.startsWith('--effort'))).toBe(false);
  });
});

describe('parseStreamLine', () => {
  it('reads tool calls from assistant messages', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/repo/a.ts' } },
        ],
      },
    });
    expect(parseStreamLine(line)).toEqual([
      { kind: 'tool', name: 'Read', input: { file_path: '/repo/a.ts' } },
    ]);
  });

  it('reads the final result', () => {
    const line = JSON.stringify({
      type: 'result',
      is_error: false,
      structured_output: { summary: 's' },
      total_cost_usd: 0.1,
    });
    expect(parseStreamLine(line)).toEqual([
      {
        kind: 'result',
        isError: false,
        message: undefined,
        output: { summary: 's' },
        costUsd: 0.1,
      },
    ]);
  });

  it('ignores other events and garbage', () => {
    expect(parseStreamLine('{"type":"system","subtype":"init"}')).toEqual([]);
    expect(parseStreamLine('not json')).toEqual([]);
  });
});

describe('describeToolUse', () => {
  it('shows paths relative to any of the roots, such as a symlinked temp folder', () => {
    expect(
      describeToolUse('Read', { file_path: '/private/var/x/src/a.ts' }, [
        '/var/x',
        '/private/var/x',
      ]),
    ).toBe('Reading src/a.ts');
  });

  it('describes what the agent is looking at', () => {
    expect(describeToolUse('Read', { file_path: '/repo/src/app.ts' }, ['/repo'])).toBe(
      'Reading src/app.ts',
    );
    expect(describeToolUse('Read', { file_path: '/ctx/pull-request.diff' }, ['/repo'])).toBe(
      'Reading pull-request.diff',
    );
    expect(describeToolUse('Grep', { pattern: 'save(' }, ['/repo'])).toBe('Searching for "save("');
    expect(describeToolUse('Glob', { pattern: '**/*.kt' }, ['/repo'])).toBe('Looking for **/*.kt');
    expect(describeToolUse('StructuredOutput', {}, ['/repo'])).toBe('Writing the review map');
  });
});

describe('createClaudeCodeAgent', () => {
  it('reports activity and returns the structured output and cost', async () => {
    const { promise, activity } = run('success');
    const result = await promise;

    expect(activity).toEqual([
      'Reading src/app.ts',
      'Searching for "UserService"',
      'Writing the review map',
    ]);
    expect(result.costUsd).toBe(0.42);
    expect(result.output).toMatchObject({ summary: 'ok' });
    expect((result.output as { args: string[] }).args).toContain('--restricted');
  });

  it('turns an error result into an AI failure with its message', async () => {
    await expect(run('error').promise).rejects.toMatchObject({
      code: 'ai-failed',
      message: 'Usage limit reached.',
    });
  });

  it('gives Claude Code an API key only when one is chosen', async () => {
    await expect(run('success').promise).resolves.toMatchObject({ output: { apiKey: null } });
    await expect(
      run('success', { apiKey: 'sk-ant-test-0000000000000000' }).promise,
    ).resolves.toMatchObject({ output: { apiKey: 'sk-ant-test-0000000000000000' } });
  });

  it('drops the credentials Claude Code would prefer over a chosen API key', () => {
    const env = withApiKey(
      {
        PATH: '/usr/bin',
        ANTHROPIC_AUTH_TOKEN: 'gateway-token',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CODE_USE_VERTEX: '1',
        CLAUDE_CODE_USE_FOUNDRY: '1',
      },
      'sk-ant-test-0000000000000000',
    );
    expect(env).toEqual({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-test-0000000000000000' });
  });

  it('says when Anthropic does not accept the API key', async () => {
    await expect(
      run('bad-key', { apiKey: 'sk-ant-test-0000000000000000' }).promise,
    ).rejects.toMatchObject({
      code: 'ai-failed',
      message: 'Anthropic did not accept the API key. Check it in Settings > AI overview.',
    });
  });

  it('complains when no review map comes back', async () => {
    await expect(run('no-output').promise).rejects.toMatchObject({ code: 'ai-invalid-output' });
  });

  it('reports a crash with the last line of stderr', async () => {
    await expect(run('crash').promise).rejects.toMatchObject({
      code: 'ai-failed',
      message: expect.stringContaining('Error: something broke'),
    });
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const { promise } = run('hang', { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toMatchObject({ code: 'ai-cancelled' });
  });

  it('stops runs that take too long', async () => {
    await expect(run('hang', { timeoutMs: 200 }).promise).rejects.toMatchObject({
      code: 'ai-failed',
      message: expect.stringContaining('too long'),
    });
  });

  it('explains how to install Claude Code when it is missing', async () => {
    const agent = createClaudeCodeAgent({ command: ['plot-claude-that-does-not-exist'] });
    await expect(
      agent.run({
        cwd,
        contextDir: cwd,
        prompt: 'p',
        schema: {},
        signal: new AbortController().signal,
        onActivity: () => {},
      }),
    ).rejects.toMatchObject({ code: 'ai-not-installed' });
  });
});
