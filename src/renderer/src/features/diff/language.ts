export interface LanguageInfo {
  id: string;
  extensions?: readonly string[];
  filenames?: readonly string[];
}

export function languageForPath(path: string, languages: readonly LanguageInfo[]): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const byName = languages.find((language) => language.filenames?.includes(name));
  if (byName) {
    return byName.id;
  }
  const lower = name.toLowerCase();
  let best: { id: string; length: number } | undefined;
  for (const language of languages) {
    for (const extension of language.extensions ?? []) {
      const candidate = extension.toLowerCase();
      if (lower.endsWith(candidate) && candidate.length > (best?.length ?? 0)) {
        best = { id: language.id, length: candidate.length };
      }
    }
  }
  return best?.id ?? 'plaintext';
}
