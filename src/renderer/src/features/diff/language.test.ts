import { describe, expect, it } from 'vitest';
import { languageForPath } from './language';

const languages = [
  { id: 'kotlin', extensions: ['.kt', '.kts'] },
  { id: 'typescript', extensions: ['.ts', '.tsx'] },
  { id: 'dockerfile', extensions: ['.dockerfile'], filenames: ['Dockerfile'] },
  { id: 'yaml', extensions: ['.yaml', '.yml'] },
  { id: 'definition', extensions: ['.d.ts'] },
];

describe('languageForPath', () => {
  it('matches by extension', () => {
    expect(languageForPath('src/main/kotlin/App.kt', languages)).toBe('kotlin');
    expect(languageForPath('build.gradle.kts', languages)).toBe('kotlin');
    expect(languageForPath('.github/workflows/ci.yml', languages)).toBe('yaml');
  });

  it('ignores the case of extensions', () => {
    expect(languageForPath('README.YML', languages)).toBe('yaml');
  });

  it('prefers exact file names over extensions', () => {
    expect(languageForPath('deploy/Dockerfile', languages)).toBe('dockerfile');
  });

  it('prefers the longest matching extension', () => {
    expect(languageForPath('types/index.d.ts', languages)).toBe('definition');
  });

  it('falls back to plain text', () => {
    expect(languageForPath('LICENSE', languages)).toBe('plaintext');
    expect(languageForPath('notes.unknown', languages)).toBe('plaintext');
  });

  it('only looks at the file name, not directories that look like extensions', () => {
    expect(languageForPath('config.kt/readme', languages)).toBe('plaintext');
  });
});
