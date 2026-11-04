import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { korean } from '@shared/translations';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) && !/\.(test|fixture)\./.test(path) ? [path] : [];
  });
}

function staticTranslationKeys(source: string): string[] {
  const calls = source.matchAll(/(?<![\w.])t\(\s*(['"])((?:\\.|(?!\1)[^\\])*?)\1/g);
  return [...calls].map((match) => (match[2] ?? '').replace(/\\(['"\\])/g, '$1').trim());
}

describe('translation coverage', () => {
  it('recognizes direct literal calls without treating dynamic keys as static text', () => {
    expect(
      staticTranslationKeys(`t('Settings'); t("Open"); t('Settings', {}); t(key); not('No');`),
    ).toEqual(['Settings', 'Open', 'Settings']);
  });

  it('provides Korean translations for direct static t calls in application source', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const path of sourceFiles('src')) {
      for (const key of staticTranslationKeys(readFileSync(path, 'utf8'))) {
        checked++;
        if (!Object.hasOwn(korean, key)) missing.push(`${path}: ${key}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
