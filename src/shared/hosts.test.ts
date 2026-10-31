import { describe, expect, it } from 'vitest';
import { apiBaseUrl, isHost, normalizeHost } from './hosts';

describe('normalizeHost', () => {
  it('accepts a host typed with or without a scheme', () => {
    expect(normalizeHost('github.example.com')).toBe('github.example.com');
    expect(normalizeHost(' https://GitHub.Example.com/ ')).toBe('github.example.com');
    expect(normalizeHost('https://github.example.com/login?x=1')).toBe('github.example.com');
  });

  it('maps the other names of github.com to github.com', () => {
    expect(normalizeHost('api.github.com')).toBe('github.com');
    expect(normalizeHost('www.github.com')).toBe('github.com');
  });

  it('rejects anything that is not a plain host name', () => {
    expect(normalizeHost('localhost')).toBeUndefined();
    expect(normalizeHost('github.example.com:8443')).toBeUndefined();
    expect(normalizeHost('git..hub.com')).toBeUndefined();
    expect(normalizeHost('-github.com')).toBeUndefined();
    expect(normalizeHost('')).toBeUndefined();
  });
});

describe('isHost', () => {
  it('keeps hosts safe to use as a directory name', () => {
    expect(isHost('github.com')).toBe(true);
    expect(isHost('../github.com')).toBe(false);
    expect(isHost('github.com/x')).toBe(false);
    expect(isHost('GitHub.com')).toBe(false);
  });
});

describe('apiBaseUrl', () => {
  it('knows where each kind of GitHub serves its REST API', () => {
    expect(apiBaseUrl('github.com')).toBe('https://api.github.com');
    expect(apiBaseUrl('octo.ghe.com')).toBe('https://api.octo.ghe.com');
    expect(apiBaseUrl('github.example.com')).toBe('https://github.example.com/api/v3');
  });
});
