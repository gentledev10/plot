export const AI_PROVIDER_IDS = ['claude-code', 'codex'] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderInfo {
  name: string;
  installUrl: string;
  signInCommand: string;
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  'claude-code': {
    name: 'Claude Code',
    installUrl: 'https://claude.com/claude-code',
    signInCommand: 'claude',
  },
  codex: {
    name: 'Codex CLI',
    installUrl: 'https://github.com/openai/codex',
    signInCommand: 'codex login',
  },
};

export interface AiSettings {
  provider: AiProviderId;
  models: Partial<Record<AiProviderId, string>>;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: 'claude-code', models: {} };

export interface AiProviderStatus {
  id: AiProviderId;
  installed: boolean;
  version?: string;
  signedIn?: boolean;
}

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function parseAiSettings(value: unknown): AiSettings | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { provider, models } = value as Record<string, unknown>;
  if (!isAiProviderId(provider)) {
    return undefined;
  }
  const parsed: AiSettings = { provider, models: {} };
  if (typeof models === 'object' && models !== null) {
    for (const id of AI_PROVIDER_IDS) {
      const model = (models as Record<string, unknown>)[id];
      if (typeof model === 'string' && MODEL.test(model)) {
        parsed.models[id] = model;
      }
    }
  }
  return parsed;
}

export function isModelName(value: string): boolean {
  return MODEL.test(value);
}
