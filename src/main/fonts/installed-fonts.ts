import { type InstalledFont, isFontFamily } from '@shared/fonts';
import type { CommandRunner } from '../system/process';

const SCRIPT = `
ObjC.import('AppKit');
const manager = $.NSFontManager.sharedFontManager;
JSON.stringify(ObjC.deepUnwrap(manager.availableFontFamilies).map((family) => ({
  family,
  monospaced: (ObjC.deepUnwrap(manager.availableMembersOfFontFamily(family)) || []).some(
    (member) => (member[3] & $.NSFixedPitchFontMask) !== 0,
  ),
})));
`;

export async function listInstalledFonts(run: CommandRunner): Promise<InstalledFont[]> {
  try {
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', SCRIPT], {
      timeoutMs: 10_000,
    });
    return parseInstalledFonts(stdout);
  } catch {
    return [];
  }
}

export function parseInstalledFonts(text: string): InstalledFont[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const fonts = new Map<string, InstalledFont>();
  for (const item of parsed) {
    const { family, monospaced } = (item ?? {}) as Record<string, unknown>;
    if (isFontFamily(family) && !family.startsWith('.')) {
      fonts.set(family, { family, monospaced: monospaced === true });
    }
  }
  return [...fonts.values()].sort((a, b) => a.family.localeCompare(b.family));
}
