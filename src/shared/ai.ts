export const AI_PROVIDER_IDS = ['claude-code', 'codex'] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderInfo {
  name: string;
  installUrl: string;
  signInCommand: string;
  apiKeyVendor: string;
  apiKeyUrl: string;
  efforts: readonly string[];
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  'claude-code': {
    name: 'Claude Code',
    installUrl: 'https://claude.com/claude-code',
    signInCommand: 'claude',
    apiKeyVendor: 'Anthropic',
    apiKeyUrl: 'https://platform.claude.com/settings/keys',
    efforts: EFFORTS,
  },
  codex: {
    name: 'Codex CLI',
    installUrl: 'https://github.com/openai/codex',
    signInCommand: 'codex login',
    apiKeyVendor: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    efforts: EFFORTS,
  },
};

export interface AiModelOption {
  id: string;
  name: string;
  efforts: readonly string[];
  defaultEffort?: string;
  isDefault?: boolean;
}

// Claude Code resolves these aliases to the newest model of each family, so the list stays
// current as models are released.
export const CLAUDE_CODE_MODELS: readonly AiModelOption[] = [
  { id: 'fable', name: 'Fable', efforts: EFFORTS },
  { id: 'opus', name: 'Opus', efforts: EFFORTS },
  { id: 'sonnet', name: 'Sonnet', efforts: EFFORTS },
  { id: 'haiku', name: 'Haiku', efforts: EFFORTS },
];

export const AI_AUTH_METHODS = ['cli', 'api-key'] as const;

export type AiAuth = (typeof AI_AUTH_METHODS)[number];

export interface AiSettings {
  provider: AiProviderId;
  models: Partial<Record<AiProviderId, string>>;
  efforts: Partial<Record<AiProviderId, string>>;
  auth: Partial<Record<AiProviderId, AiAuth>>;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'claude-code',
  models: {},
  efforts: {},
  auth: {},
};

export interface AiProviderStatus {
  id: AiProviderId;
  installed: boolean;
  version?: string;
  signedIn?: boolean;
  apiKeySaved: boolean;
  compatibilityIssue?: string;
}

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;
const API_KEY = /^[\x21-\x7e]{20,300}$/;
const EFFORT = /^[a-z]{1,16}$/;

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function authOf(settings: AiSettings, id: AiProviderId): AiAuth {
  return settings.auth[id] ?? 'cli';
}

export function parseAiSettings(value: unknown): AiSettings | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { provider, models, efforts, auth } = value as Record<string, unknown>;
  if (!isAiProviderId(provider)) {
    return undefined;
  }
  const parsed: AiSettings = { provider, models: {}, efforts: {}, auth: {} };
  for (const id of AI_PROVIDER_IDS) {
    const model = fieldOf(models, id);
    if (typeof model === 'string' && MODEL.test(model)) {
      parsed.models[id] = model;
    }
    const effort = fieldOf(efforts, id);
    if (isEffort(effort)) {
      parsed.efforts[id] = effort;
    }
    const method = fieldOf(auth, id);
    if ((AI_AUTH_METHODS as readonly unknown[]).includes(method)) {
      parsed.auth[id] = method as AiAuth;
    }
  }
  return parsed;
}

export function isModelName(value: string): boolean {
  return MODEL.test(value);
}

export function isApiKey(value: string): boolean {
  return API_KEY.test(value);
}

export function isEffort(value: unknown): value is string {
  return typeof value === 'string' && EFFORT.test(value);
}

function fieldOf(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null
    ? (record as Record<string, unknown>)[key]
    : undefined;
}
