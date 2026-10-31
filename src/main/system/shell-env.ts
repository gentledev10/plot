import type { CommandRunner } from './process';

const MARKER = '__PLOT_PATH__';

export function extractMarkedPath(output: string): string | undefined {
  const start = output.indexOf(MARKER);
  const end = output.indexOf(MARKER, start + MARKER.length);
  if (start === -1 || end === -1) {
    return undefined;
  }
  const value = output.slice(start + MARKER.length, end).trim();
  return value === '' ? undefined : value;
}

// Apps opened from Finder inherit a minimal PATH, so tools installed with Homebrew such as gh
// are invisible until we ask the user's login shell for its PATH.
export async function resolveLoginShellPath(
  run: CommandRunner,
  shell: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await run(shell, ['-ilc', `printf '${MARKER}%s${MARKER}' "$PATH"`], {
      timeoutMs: 5_000,
    });
    return extractMarkedPath(stdout);
  } catch {
    return undefined;
  }
}

export function mergePaths(...paths: ReadonlyArray<string | undefined>): string {
  const seen = new Set<string>();
  for (const path of paths) {
    for (const dir of path?.split(':') ?? []) {
      if (dir !== '') {
        seen.add(dir);
      }
    }
  }
  return [...seen].join(':');
}
