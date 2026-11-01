import {
  type AiModelOption,
  type AiProviderId,
  CLAUDE_CODE_MODELS,
  isEffort,
  isModelName,
} from '@shared/ai';
import { queryCodexModels } from './codex-models';

export async function listAiModels(
  id: AiProviderId,
  options: Parameters<typeof queryCodexModels>[0] = {},
): Promise<AiModelOption[]> {
  if (id === 'claude-code') {
    return [...CLAUDE_CODE_MODELS];
  }
  return parseCodexModels(JSON.stringify({ data: await queryCodexModels(options) }));
}

export function parseCodexModels(text: string): AiModelOption[] {
  let catalog: unknown;
  try {
    catalog = JSON.parse(text);
  } catch {
    return [];
  }
  const models = (catalog as { data?: unknown } | null)?.data;
  if (!Array.isArray(models)) {
    return [];
  }
  return models.flatMap((entry: Record<string, unknown>) => {
    if (
      !entry ||
      entry.hidden === true ||
      typeof entry.model !== 'string' ||
      !isModelName(entry.model)
    ) {
      return [];
    }
    const levels = Array.isArray(entry.supportedReasoningEfforts)
      ? entry.supportedReasoningEfforts
      : [];
    return [
      {
        id: entry.model,
        name: typeof entry.displayName === 'string' ? entry.displayName : entry.model,
        efforts: levels
          .map((level: { reasoningEffort?: unknown }) => level?.reasoningEffort)
          .filter(isEffort),
        defaultEffort: isEffort(entry.defaultReasoningEffort)
          ? entry.defaultReasoningEffort
          : undefined,
        ...(entry.isDefault === true ? { isDefault: true } : {}),
      },
    ];
  });
}
