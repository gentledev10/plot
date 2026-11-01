import { describe, expect, it } from 'vitest';
import {
  type AiProviderStatus,
  authOf,
  DEFAULT_AI_SETTINGS,
  isApiKey,
  parseAiSettings,
  selectAvailableProvider,
} from './ai';

describe('parseAiSettings', () => {
  it('reads settings saved before the sign-in choice existed', () => {
    const settings = parseAiSettings({ provider: 'codex', models: { codex: 'gpt-5' } });
    expect(settings).toEqual({
      provider: 'codex',
      models: { codex: 'gpt-5' },
      efforts: {},
      auth: {},
    });
    expect(settings && authOf(settings, 'codex')).toBe('cli');
  });

  it('keeps the sign-in chosen for each tool and drops anything else', () => {
    expect(
      parseAiSettings({
        provider: 'claude-code',
        models: {},
        auth: { 'claude-code': 'api-key', codex: 'magic', other: 'api-key' },
      }),
    ).toEqual({
      provider: 'claude-code',
      models: {},
      efforts: {},
      auth: { 'claude-code': 'api-key' },
    });
  });

  it('refuses an unknown tool', () => {
    expect(parseAiSettings({ provider: 'gpt', models: {}, auth: {} })).toBeUndefined();
  });

  it('preserves the automatic choice without changing older saved choices', () => {
    expect(parseAiSettings(DEFAULT_AI_SETTINGS)?.autoSelect).toBe(true);
    expect(parseAiSettings({ provider: 'claude-code' })?.autoSelect).toBeUndefined();
  });
});

describe('selectAvailableProvider', () => {
  const statuses: AiProviderStatus[] = [
    {
      id: 'claude-code',
      installed: true,
      signedIn: true,
      apiKeySaved: true,
      compatibilityIssue: 'Update Claude Code.',
    },
    { id: 'codex', installed: true, signedIn: true, apiKeySaved: false },
  ];

  it('uses signed-in Codex when Claude cannot run restricted overviews', () => {
    expect(selectAvailableProvider(DEFAULT_AI_SETTINGS, statuses).provider).toBe('codex');
  });

  it('keeps a manual choice even if it needs setup', () => {
    const settings = { ...DEFAULT_AI_SETTINGS, autoSelect: false };
    expect(selectAvailableProvider(settings, statuses)).toBe(settings);
  });

  it('uses the selected authentication method when checking readiness', () => {
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      auth: { codex: 'api-key' as const },
    };
    expect(selectAvailableProvider(settings, statuses)).toBe(settings);
    expect(
      selectAvailableProvider(settings, [
        { id: 'codex', installed: true, signedIn: false, apiKeySaved: true },
      ]).provider,
    ).toBe('codex');
  });

  it('keeps the current ready tool and does not assume unknown sign-in is ready', () => {
    const settings = { ...DEFAULT_AI_SETTINGS, provider: 'codex' as const };
    expect(
      selectAvailableProvider(
        settings,
        statuses.map((status) => ({ ...status, compatibilityIssue: undefined })),
      ).provider,
    ).toBe('codex');
    expect(
      selectAvailableProvider(DEFAULT_AI_SETTINGS, [
        { id: 'codex', installed: true, apiKeySaved: false },
      ]),
    ).toBe(DEFAULT_AI_SETTINGS);
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

  it('keeps a plain effort level for each tool and drops anything that could become a flag', () => {
    expect(
      parseAiSettings({
        provider: 'claude-code',
        models: {},
        efforts: { 'claude-code': 'xhigh', codex: 'high"; rm' },
      })?.efforts,
    ).toEqual({ 'claude-code': 'xhigh' });
  });
});
