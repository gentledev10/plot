import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_CODE_MODELS } from '@shared/ai';
import { describe, expect, it } from 'vitest';
import { queryCodexModels } from './codex-models';
import { listAiModels, parseCodexModels } from './models';

const catalog = {
  data: [
    {
      model: 'gpt-6-sol',
      displayName: 'GPT-6-Sol',
      hidden: false,
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'Fast' },
        { reasoningEffort: 'medium', description: 'Balanced' },
        { reasoningEffort: 'ultra', description: 'Delegates' },
      ],
    },
    { model: 'codex-auto-review', displayName: 'Auto review', hidden: true },
    { model: 'bad name', hidden: false },
    {
      model: 'gpt-5.5',
      hidden: false,
      supportedReasoningEfforts: [{ reasoningEffort: 'HIGH;rm' }, { reasoningEffort: 'high' }],
    },
  ],
};

describe('parseCodexModels', () => {
  it('keeps the models Codex lists in its picker, with their efforts', () => {
    expect(parseCodexModels(JSON.stringify(catalog))).toEqual([
      {
        id: 'gpt-6-sol',
        name: 'GPT-6-Sol',
        efforts: ['low', 'medium', 'ultra'],
        defaultEffort: 'medium',
      },
      { id: 'gpt-5.5', name: 'gpt-5.5', efforts: ['high'], defaultEffort: undefined },
    ]);
  });

  it('returns nothing for output it does not understand', () => {
    expect(parseCodexModels('not json')).toEqual([]);
    expect(parseCodexModels('{"models": 3}')).toEqual([]);
  });
});

const command = [process.execPath, join(__dirname, 'fixtures/fake-model-server.mjs')];

describe('listAiModels', () => {
  it('offers the Claude Code aliases', async () => {
    await expect(listAiModels('claude-code')).resolves.toEqual(CLAUDE_CODE_MODELS);
  });

  it('uses model/list rather than a bundled catalog, including pagination', async () => {
    const models = await listAiModels('codex', {
      command,
      env: { ...process.env, PLOT_TEST_MODEL_MODE: 'pages' },
    });
    expect(models.map((model) => model.id)).toEqual(['available-model', 'second-model']);
    expect(models[0]).toMatchObject({ isDefault: true, efforts: ['high'] });
  });

  it('keeps API-key discovery out of the user Codex home and cleans it up', async () => {
    const models = (await queryCodexModels({ command, apiKey: 'fixture-key' })) as {
      debugHome: string;
    }[];
    const home = models[0]?.debugHome;
    expect(home).toBeTruthy();
    expect(home).not.toBe(process.env.CODEX_HOME);
    expect(existsSync(home ?? '')).toBe(false);
  });

  it('reports failures without leaking provider details or falling back to stale models', async () => {
    await expect(
      listAiModels('codex', { command, env: { ...process.env, PLOT_TEST_MODEL_MODE: 'error' } }),
    ).rejects.toThrow(/could not load/);
    await expect(
      queryCodexModels({
        command,
        env: { ...process.env, PLOT_TEST_MODEL_MODE: 'hang' },
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/Could not load/);
  });

  it('rejects a stale ChatGPT catalog but retains API-key access to the same model', async () => {
    const options = { command, env: { ...process.env, PLOT_TEST_MODEL_MODE: 'retired' } };
    await expect(queryCodexModels(options)).rejects.toThrow(/only retired models/);
    const models = await listAiModels('codex', { ...options, apiKey: 'fixture-key' });
    expect(models[0]?.id).toBe('gpt-5.5');
  });
});
