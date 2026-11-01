import {
  type AiModelOption,
  type AiProviderId,
  CLAUDE_CODE_MODELS,
  isEffort,
  isModelName,
} from '@shared/ai';
import type { CommandRunner } from '../system/process';

const TIMEOUT_MS = 15_000;

export async function listAiModels(run: CommandRunner, id: AiProviderId): Promise<AiModelOption[]> {
  if (id === 'claude-code') {
    return [...CLAUDE_CODE_MODELS];
  }
  try {
    const { stdout } = await run('codex', ['debug', 'models', '--bundled'], {
      timeoutMs: TIMEOUT_MS,
    });
    return parseCodexModels(stdout);
  } catch {
    return [];
  }
}

// The catalog Codex shows in its own model picker, with the efforts each model accepts.
export function parseCodexModels(text: string): AiModelOption[] {
  let catalog: unknown;
  try {
    catalog = JSON.parse(text);
  } catch {
    return [];
  }
  const models = (catalog as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) {
    return [];
  }
  return models.flatMap((entry: Record<string, unknown>) => {
    if (
      entry?.visibility !== 'list' ||
      typeof entry.slug !== 'string' ||
      !isModelName(entry.slug)
    ) {
      return [];
    }
    const levels = Array.isArray(entry.supported_reasoning_levels)
      ? entry.supported_reasoning_levels
      : [];
    return [
      {
        id: entry.slug,
        name: typeof entry.display_name === 'string' ? entry.display_name : entry.slug,
        efforts: levels.map((level: { effort?: unknown }) => level?.effort).filter(isEffort),
        defaultEffort: isEffort(entry.default_reasoning_level)
          ? entry.default_reasoning_level
          : undefined,
      },
    ];
  });
}
