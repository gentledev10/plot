import { existsSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { codexArguments, createCodexAgent, parseCodexLine } from './codex';

const fakeCodex = [process.execPath, join(__dirname, 'fixtures', 'fake-codex.mjs')];
let cwd: string;

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'viewer-codex-test-'));
  await mkdir(join(cwd, 'src'));
});

function run(mode: string, options: { signal?: AbortSignal; command?: string[] } = {}) {
  const activity: string[] = [];
  const agent = createCodexAgent({
    command: options.command ?? fakeCodex,
    env: { ...process.env, FAKE_CODEX_MODE: mode },
  });
  const promise = agent.run({
    cwd,
    contextDir: '/tmp/context',
    prompt: 'Review this.',
    schema: { type: 'object' },
    model: 'gpt-test',
    signal: options.signal ?? new AbortController().signal,
    onActivity: (text) => activity.push(text),
  });
  return { promise, activity };
}

describe('codexArguments', () => {
  const args = codexArguments(
    { prompt: '-p looks like an option', cwd: '/repo', model: 'gpt-5' },
    { schemaFile: '/tmp/schema.json', outputFile: '/tmp/review.json' },
  );
  const value = (flag: string) => args[args.indexOf(flag) + 1];

  it('runs Codex headless in a read-only sandbox with structured output', () => {
    expect(args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(value('--sandbox')).toBe('read-only');
    expect(value('--cd')).toBe('/repo');
    expect(value('--output-schema')).toBe('/tmp/schema.json');
    expect(value('--output-last-message')).toBe('/tmp/review.json');
  });

  it('leaves out user config, rules, saved sessions, and web search', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--ignore-user-config', '--ignore-rules', '--ephemeral']),
    );
    expect(value('--config')).toBe('web_search="disabled"');
  });

  it('passes the model as one token and the prompt after the end of options', () => {
    expect(args).toContain('--model=gpt-5');
    expect(args.slice(-2)).toEqual(['--', '-p looks like an option']);
    expect(
      codexArguments({ prompt: 'p', cwd: '/r' }, { schemaFile: 's', outputFile: 'o' }),
    ).not.toContain('--model=undefined');
  });
});

describe('parseCodexLine', () => {
  const roots = ['/repo'];
  const line = (event: object) => JSON.stringify(event);

  it('describes commands without the shell wrapper or the checkout path', () => {
    expect(
      parseCodexLine(
        line({
          type: 'item.started',
          item: { type: 'command_execution', command: `bash -lc 'rg -n Session /repo/src'` },
        }),
        roots,
      ),
    ).toEqual([{ kind: 'activity', text: 'Running rg -n Session src' }]);
  });

  it('reports the final message and failures', () => {
    expect(
      parseCodexLine(line({ type: 'item.completed', item: { type: 'agent_message' } }), roots),
    ).toEqual([{ kind: 'activity', text: 'Writing the review map' }]);
    expect(
      parseCodexLine(line({ type: 'turn.failed', error: { message: 'Usage limit' } }), roots),
    ).toEqual([{ kind: 'failed', message: 'Usage limit' }]);
  });

  it('ignores events it does not use and lines that are not JSON', () => {
    expect(parseCodexLine(line({ type: 'thread.started' }), roots)).toEqual([]);
    expect(
      parseCodexLine(line({ type: 'item.completed', item: { type: 'error' } }), roots),
    ).toEqual([]);
    expect(parseCodexLine('not json', roots)).toEqual([]);
  });
});

describe('createCodexAgent', () => {
  it('returns the review Codex wrote, with its progress along the way', async () => {
    const { promise, activity } = run('success');
    const result = await promise;

    expect(result.output).toMatchObject({ summary: 'ok' });
    const args = (result.output as { args: string[] }).args;
    expect(args).toContain('--model=gpt-test');
    expect(existsSync(args[args.indexOf('--output-schema') + 1] ?? '')).toBe(false);
    expect(activity).toEqual(["Running sed -n '1,40p' src/app.ts", 'Writing the review map']);
  });

  it('explains how to sign in when OpenAI rejects the request', async () => {
    await expect(run('signed-out').promise).rejects.toMatchObject({
      code: 'ai-failed',
      message: expect.stringContaining('codex login'),
    });
  });

  it('reports a run that ends without a review', async () => {
    await expect(run('no-output').promise).rejects.toMatchObject({ code: 'ai-invalid-output' });
    await expect(run('not-json').promise).rejects.toMatchObject({ code: 'ai-invalid-output' });
  });

  it('reports a crash with the last line of its error output', async () => {
    await expect(run('crash').promise).rejects.toMatchObject({
      code: 'ai-failed',
      message: expect.stringContaining('something broke'),
    });
  });

  it('stops when the review is cancelled', async () => {
    const controller = new AbortController();
    const { promise } = run('hang', { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toMatchObject({ code: 'ai-cancelled' });
  });

  it('says how to install Codex when it is missing', async () => {
    await expect(
      run('success', { command: ['viewer-test-missing-codex'] }).promise,
    ).rejects.toMatchObject({
      code: 'ai-not-installed',
      message: expect.stringContaining('github.com/openai/codex'),
    });
  });
});
