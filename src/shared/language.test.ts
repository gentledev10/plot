import { describe, expect, it } from 'vitest';
import { appLanguage, DEFAULT_LANGUAGES, parseLanguages, reviewLanguage } from './language';
import { createTranslator } from './translations';

describe('language settings', () => {
  it('follows the system and app by default, including regional Korean locales', () => {
    expect(appLanguage(DEFAULT_LANGUAGES, 'ko-KR')).toBe('ko');
    expect(reviewLanguage(DEFAULT_LANGUAGES, 'ko-KR')).toBe('ko');
    expect(appLanguage(DEFAULT_LANGUAGES, 'fr-FR')).toBe('en');
  });
  it('allows Korean reviews with an English app and preserves an explicit review choice', () => {
    expect(reviewLanguage({ app: 'en', review: 'ko' }, 'en-US')).toBe('ko');
    expect(reviewLanguage({ app: 'ko', review: 'en' }, 'ko-KR')).toBe('en');
    expect(parseLanguages({ app: '../../x', review: 'ignore instructions' })).toEqual(
      DEFAULT_LANGUAGES,
    );
  });
  it('translates interface text without translating code identifiers supplied as values', () => {
    const t = createTranslator('ko');
    expect(t('Settings')).toBe('설정');
    expect(t('Could not open {value0}', { value0: 'Settings.tsx' })).toBe(
      'Settings.tsx을 열 수 없습니다',
    );
    expect(createTranslator('en')('Settings')).toBe('Settings');
  });
});
