import { AppError } from '../errors';

export const MINIMUM_CLAUDE_VERSION = '2.1.248';

export function supportsRestrictedMode(version: string): boolean {
  const match = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(version);
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  const minimum = MINIMUM_CLAUDE_VERSION.split('.').map(Number);
  for (let index = 0; index < minimum.length; index++) {
    const difference = (actual[index] ?? 0) - (minimum[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function requireRestrictedMode(version: string): void {
  if (!supportsRestrictedMode(version)) {
    throw new AppError(
      'ai-not-configured',
      `Claude Code ${MINIMUM_CLAUDE_VERSION} or later is required for read-only overviews. Update Claude Code, then check the installed tools again in Settings > AI overview.`,
    );
  }
}
