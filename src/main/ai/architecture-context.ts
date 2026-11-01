import type { BlobContent, ChangedFile } from '@shared/diff';

const MAX_FILES = 8;
const MAX_FILE_BYTES = 16_000;
const MAX_CHARACTERS = 32_000;
const MANIFEST =
  /^(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?)$/;
const DOCUMENT = /^(README(?:\.(?:md|rst|txt))?|ARCHITECTURE\.md|DESIGN\.md)$/i;

export function architectureContextPaths(
  paths: readonly string[],
  changed: readonly ChangedFile[],
): string[] {
  const related = (path: string) =>
    changed.some((file) => file.path.startsWith(`${path.slice(0, path.lastIndexOf('/') + 1)}`));
  return [...new Set(paths)]
    .filter((path) => {
      const parts = path.split('/');
      if (
        parts.some(
          (part) =>
            !part || part === '..' || ['node_modules', 'vendor', 'dist', '.git'].includes(part),
        )
      )
        return false;
      const name = parts.at(-1) ?? '';
      return (
        (parts.length <= 4 && (MANIFEST.test(name) || DOCUMENT.test(name))) ||
        (parts.length <= 4 && /(?:^|\/)architecture\/[^/]+\.md$/i.test(path))
      );
    })
    .sort((a, b) => {
      const rank = (path: string) =>
        !path.includes('/') ? 0 : /architecture|design/i.test(path) ? 1 : related(path) ? 2 : 3;
      return (
        rank(a) - rank(b) ||
        a.split('/').length - b.split('/').length ||
        (a < b ? -1 : a > b ? 1 : 0)
      );
    })
    .slice(0, MAX_FILES);
}

export async function collectArchitectureContext(
  paths: readonly string[],
  changed: readonly ChangedFile[],
  read: (path: string, maxBytes: number) => Promise<BlobContent>,
  checkpoint: () => void = () => {},
) {
  const selected = architectureContextPaths(paths, changed);
  const files: { path: string; text: string; truncated: boolean }[] = [];
  const unavailable: string[] = [];
  let remaining = MAX_CHARACTERS;
  for (const path of selected) {
    checkpoint();
    if (remaining <= 0) {
      unavailable.push(path);
      continue;
    }
    try {
      const content = await read(path, MAX_FILE_BYTES);
      if (content?.kind !== 'text') {
        unavailable.push(path);
        continue;
      }
      const text = content.text.slice(0, remaining);
      files.push({ path, text, truncated: text.length < content.text.length });
      remaining -= text.length;
    } catch {
      unavailable.push(path);
    }
    checkpoint();
  }
  return {
    files,
    unavailable,
    scope:
      'A bounded sample of repository documentation and manifests, plus the changed directories. This is not a complete repository audit. Missing or truncated files and relationships inferred from paths must be disclosed.',
  };
}
