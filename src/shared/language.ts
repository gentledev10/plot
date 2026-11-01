export const LANGUAGE_PREFERENCE = 'languages';
export const SYSTEM_LOCALE_PREFERENCE = 'system-locale';

export const LANGUAGES = [
  { id: 'ko', name: '한국어', prompt: 'Korean' },
  { id: 'en', name: 'English', prompt: 'English' },
] as const;

export type Language = (typeof LANGUAGES)[number]['id'];
export interface LanguageSettings {
  app: Language | 'system';
  review: Language | 'app';
}

export const DEFAULT_LANGUAGES: LanguageSettings = { app: 'system', review: 'app' };

export function isLanguage(value: unknown): value is Language {
  return value === 'ko' || value === 'en';
}

export function parseLanguages(value: unknown): LanguageSettings {
  const settings = value as Partial<LanguageSettings> | null | undefined;
  return {
    app: isLanguage(settings?.app) ? settings.app : 'system',
    review: isLanguage(settings?.review) ? settings.review : 'app',
  };
}

export function appLanguage(settings: LanguageSettings, systemLocale: string): Language {
  return settings.app === 'system'
    ? systemLocale.toLowerCase().startsWith('ko')
      ? 'ko'
      : 'en'
    : settings.app;
}

export function reviewLanguage(settings: LanguageSettings, systemLocale: string): Language {
  return settings.review === 'app' ? appLanguage(settings, systemLocale) : settings.review;
}

export function promptLanguage(language: Language): string {
  return LANGUAGES.find((option) => option.id === language)?.prompt ?? 'English';
}
