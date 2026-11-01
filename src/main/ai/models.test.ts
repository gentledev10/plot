import { CLAUDE_CODE_MODELS } from '@shared/ai';
import { describe, expect, it, vi } from 'vitest';
import { CommandError } from '../system/process';
import { listAiModels, parseCodexModels } from './models';

const catalog = {
  models: [
    {
      slug: 'gpt-6-sol',
      display_name: 'GPT-6-Sol',
      visibility: 'list',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [
        { effort: 'low', description: 'Fast' },
        { effort: 'medium', description: 'Balanced' },
        { effort: 'ultra', description: 'Delegates' },
      ],
    },
    { slug: 'codex-auto-review', display_name: 'Auto review', visibility: 'hide' },
    { slug: 'bad name', visibility: 'list' },
    {
      slug: 'gpt-5.5',
      visibility: 'list',
      supported_reasoning_levels: [{ effort: 'HIGH;rm' }, { effort: 'high' }],
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

describe('listAiModels', () => {
  it('offers the Claude Code aliases without running anything', async () => {
    const run = vi.fn();
    await expect(listAiModels(run, 'claude-code')).resolves.toEqual(CLAUDE_CODE_MODELS);
    expect(run).not.toHaveBeenCalled();
  });

  it('reads the catalog bundled with Codex, and nothing when Codex is missing', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(catalog), stderr: '' });
    await expect(listAiModels(run, 'codex')).resolves.toHaveLength(2);
    expect(run).toHaveBeenCalledWith('codex', ['debug', 'models', '--bundled'], {
      timeoutMs: 15_000,
    });

    const missing = vi.fn().mockRejectedValue(new CommandError('not-found', 'codex', ''));
    await expect(listAiModels(missing, 'codex')).resolves.toEqual([]);
  });
});
