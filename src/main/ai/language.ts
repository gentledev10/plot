export function languageName(locale: string): string {
  const code = locale.split(/[-_]/)[0] ?? '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? 'English';
  } catch {
    return 'English';
  }
}
