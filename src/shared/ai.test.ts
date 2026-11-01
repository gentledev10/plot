import { describe, expect, it } from 'vitest';
import { authOf, isApiKey, parseAiSettings } from './ai';

describe('parseAiSettings', () => {
  it('reads settings saved before the sign-in choice existed', () => {
    const settings = parseAiSettings({ provider: 'codex', models: { codex: 'gpt-5' } });
    expect(settings).toEqual({ provider: 'codex', models: { codex: 'gpt-5' }, auth: {} });
    expect(settings && authOf(settings, 'codex')).toBe('cli');
  });

  it('keeps the sign-in chosen for each tool and drops anything else', () => {
    expect(
      parseAiSettings({
        provider: 'claude-code',
        models: {},
        auth: { 'claude-code': 'api-key', codex: 'magic', other: 'api-key' },
      }),
    ).toEqual({ provider: 'claude-code', models: {}, auth: { 'claude-code': 'api-key' } });
  });

  it('refuses an unknown tool', () => {
    expect(parseAiSettings({ provider: 'gpt', models: {}, auth: {} })).toBeUndefined();
  });
});

describe('isApiKey', () => {
  it('accepts keys from Anthropic and OpenAI', () => {
    expect(isApiKey(`sk-ant-api03-${'a'.repeat(40)}`)).toBe(true);
    expect(isApiKey(`sk-proj-${'b'.repeat(40)}`)).toBe(true);
  });

  it('refuses text with spaces, line breaks, or too few characters', () => {
    expect(isApiKey('sk-ant short')).toBe(false);
    expect(isApiKey(`sk-ant-${'a'.repeat(30)}\nrm -rf /`)).toBe(false);
    expect(isApiKey('sk-123')).toBe(false);
  });
});
