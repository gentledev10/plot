import { COMMANDS, type CommandId } from './commands';
import { normalizeStroke } from './keystroke';

export type KeymapOverrides = Partial<Record<CommandId, readonly string[]>>;

export type Bindings = Readonly<Record<CommandId, readonly string[]>>;

function defaultKeys(id: CommandId): readonly string[] {
  return COMMANDS.find((command) => command.id === id)?.keys ?? [];
}

export function resolveBindings(overrides: KeymapOverrides): Bindings {
  return Object.fromEntries(
    COMMANDS.map((command) => [command.id, overrides[command.id] ?? command.keys]),
  ) as Bindings;
}

export function commandsByStroke(bindings: Bindings): Map<string, CommandId> {
  const commands = new Map<string, CommandId>();
  for (const command of COMMANDS) {
    for (const stroke of bindings[command.id]) {
      if (!commands.has(stroke)) {
        commands.set(stroke, command.id);
      }
    }
  }
  return commands;
}

export function findConflict(
  bindings: Bindings,
  stroke: string,
  except: CommandId,
): CommandId | undefined {
  return COMMANDS.find((command) => command.id !== except && bindings[command.id].includes(stroke))
    ?.id;
}

export function isCustomized(overrides: KeymapOverrides, id: CommandId): boolean {
  return overrides[id] !== undefined;
}

export function assignStroke(
  overrides: KeymapOverrides,
  id: CommandId,
  stroke: string,
): KeymapOverrides {
  const bindings = resolveBindings(overrides);
  const next: KeymapOverrides = { ...withoutStrokes(overrides, [stroke], id) };
  const current = bindings[id];
  next[id] = current.includes(stroke) ? current : [...current, stroke];
  return compact(next);
}

export function removeStroke(
  overrides: KeymapOverrides,
  id: CommandId,
  stroke: string,
): KeymapOverrides {
  const current = resolveBindings(overrides)[id];
  return compact({ ...overrides, [id]: current.filter((candidate) => candidate !== stroke) });
}

export function resetCommand(overrides: KeymapOverrides, id: CommandId): KeymapOverrides {
  const { [id]: _removed, ...rest } = overrides;
  return compact(withoutStrokes(rest, defaultKeys(id), id));
}

function withoutStrokes(
  overrides: KeymapOverrides,
  strokes: readonly string[],
  keep: CommandId,
): KeymapOverrides {
  const bindings = resolveBindings(overrides);
  const next: KeymapOverrides = { ...overrides };
  for (const command of COMMANDS) {
    if (command.id === keep) {
      continue;
    }
    const kept = bindings[command.id].filter((stroke) => !strokes.includes(stroke));
    if (kept.length !== bindings[command.id].length) {
      next[command.id] = kept;
    }
  }
  return next;
}

function compact(overrides: KeymapOverrides): KeymapOverrides {
  const next: KeymapOverrides = {};
  for (const command of COMMANDS) {
    const keys = overrides[command.id];
    if (keys !== undefined && !sameKeys(keys, command.keys)) {
      next[command.id] = keys;
    }
  }
  return next;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function parseOverrides(stored: unknown): KeymapOverrides | undefined {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return undefined;
  }
  const record = stored as Record<string, unknown>;
  const overrides: KeymapOverrides = {};
  for (const command of COMMANDS) {
    const keys = record[command.id];
    if (!Array.isArray(keys)) {
      continue;
    }
    const strokes = keys
      .map((key) => (typeof key === 'string' ? normalizeStroke(key) : undefined))
      .filter((stroke): stroke is string => stroke !== undefined);
    overrides[command.id] = [...new Set(strokes)];
  }
  return compact(overrides);
}
