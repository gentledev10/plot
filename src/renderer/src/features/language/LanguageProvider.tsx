import type { PlotApi } from '@shared/ipc';
import {
  appLanguage,
  LANGUAGE_PREFERENCE,
  type LanguageSettings,
  parseLanguages,
  reviewLanguage,
  SYSTEM_LOCALE_PREFERENCE,
} from '@shared/language';
import { createTranslator } from '@shared/translations';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { cachePreference, readPreference } from '../../lib/preferences';

const fallback = {
  settings: parseLanguages(undefined),
  language: 'en' as const,
  reviewLanguage: 'en' as const,
  t: createTranslator('en'),
  change: async (_settings: LanguageSettings) => {},
};
const LanguageContext = createContext<{
  settings: LanguageSettings;
  language: 'en' | 'ko';
  reviewLanguage: 'en' | 'ko';
  t: ReturnType<typeof createTranslator>;
  change(settings: LanguageSettings): Promise<void>;
}>(fallback);

export function LanguageProvider({ api, children }: { api: PlotApi; children: ReactNode }) {
  const [settings, setSettings] = useState(() =>
    parseLanguages(readPreference(LANGUAGE_PREFERENCE, undefined)),
  );
  const system = readPreference(SYSTEM_LOCALE_PREFERENCE, navigator.language);
  const language = appLanguage(settings, system);
  const value = useMemo(
    () => ({
      settings,
      language,
      reviewLanguage: reviewLanguage(settings, system),
      t: createTranslator(language),
      async change(next: LanguageSettings) {
        const parsed = parseLanguages(next);
        await api.setPreference(LANGUAGE_PREFERENCE, parsed);
        cachePreference(LANGUAGE_PREFERENCE, parsed);
        setSettings(parsed);
      },
    }),
    [api, settings, language, system],
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useLanguage().t;
