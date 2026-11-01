import { DEFAULT_AI_SETTINGS } from '@shared/ai';
import { describe, expect, it, vi } from 'vitest';
import { createAiService } from './ai-service';

function setup() {
  const saved = new Set<string>(['codex']);
  const keys = {
    has: vi.fn(async (id: string) => saved.has(id)),
    save: vi.fn(async (id: string) => {
      saved.add(id);
    }),
    remove: vi.fn(async (id: string) => {
      saved.delete(id);
    }),
  };
  const service = createAiService({
    store: { read: async () => DEFAULT_AI_SETTINGS, write: async () => {} },
    keys,
    detect: async (id) => ({ id, installed: true, signedIn: id === 'claude-code' }),
  });
  return { service, keys };
}

describe('createAiService', () => {
  it('tells whether each tool has an API key saved, next to what the tool reports', async () => {
    const { service } = setup();
    await expect(service.detectAiProviders()).resolves.toEqual([
      { id: 'claude-code', installed: true, signedIn: true, apiKeySaved: false },
      { id: 'codex', installed: true, signedIn: false, apiKeySaved: true },
    ]);
  });

  it('saves and removes a key for one tool', async () => {
    const { service, keys } = setup();
    await service.saveAiApiKey('claude-code', 'sk-ant-api03-secret-value');
    await service.removeAiApiKey('codex');
    expect(keys.save).toHaveBeenCalledWith('claude-code', 'sk-ant-api03-secret-value');
    expect(keys.remove).toHaveBeenCalledWith('codex');
  });
});
