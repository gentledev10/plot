import { describe, expect, it } from 'vitest';
import { languageName } from './language';

describe('languageName', () => {
  it('names the language of the system locale in English, for the prompt', () => {
    expect(languageName('ko-KR')).toBe('Korean');
    expect(languageName('en-US')).toBe('English');
    expect(languageName('ja')).toBe('Japanese');
    expect(languageName('pt_BR')).toBe('Portuguese');
  });

  it('falls back to English for locales it cannot read', () => {
    expect(languageName('')).toBe('English');
    expect(languageName('???')).toBe('English');
  });
});
