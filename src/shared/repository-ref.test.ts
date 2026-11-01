import { describe, expect, it } from 'vitest';
import {
  formatRepositoryRef,
  isRepositoryRef,
  isSameRepository,
  parseRepositoryRef,
  repositoryKey,
} from './repository-ref';

const api = { host: 'github.com', owner: 'acme', repo: 'api' };

describe('parseRepositoryRef', () => {
  it('reads owner/repo on the default host', () => {
    expect(parseRepositoryRef('acme/api')).toEqual(api);
    expect(parseRepositoryRef(' acme/api/ ')).toEqual(api);
    expect(parseRepositoryRef('acme/api', 'github.example.com')).toEqual({
      ...api,
      host: 'github.example.com',
    });
  });

  it('reads page and clone URLs', () => {
    expect(parseRepositoryRef('https://github.com/acme/api')).toEqual(api);
    expect(parseRepositoryRef('https://octocat@github.com/acme/api.git')).toEqual(api);
    expect(parseRepositoryRef('ssh://git@github.com/acme/api.git')).toEqual(api);
    expect(parseRepositoryRef('ssh://git@github.com:22/acme/api')).toEqual(api);
    expect(parseRepositoryRef('https://github.com/acme/api/pull/12/files')).toEqual(api);
    expect(parseRepositoryRef('https://github.com/acme/api.git')).toEqual(api);
    expect(parseRepositoryRef('git@github.com:acme/api.git')).toEqual(api);
    expect(parseRepositoryRef('https://www.github.com/acme/api?tab=readme')).toEqual(api);
  });

  it('reads repositories on a company server', () => {
    const company = { host: 'github.example.com', owner: 'platform', repo: 'infra' };
    expect(parseRepositoryRef('https://github.example.com/platform/infra')).toEqual(company);
    expect(parseRepositoryRef('github.example.com/platform/infra')).toEqual(company);
  });

  it('rejects text that is not a repository', () => {
    expect(parseRepositoryRef('acme')).toBeUndefined();
    expect(parseRepositoryRef('acme.io/api')).toBeUndefined();
    expect(parseRepositoryRef('acme/..')).toBeUndefined();
    expect(parseRepositoryRef('https://github.com/acme')).toBeUndefined();
    expect(parseRepositoryRef('acme/api extra')).toBeUndefined();
  });
});

describe('isRepositoryRef', () => {
  it('checks every part', () => {
    expect(isRepositoryRef(api)).toBe(true);
    expect(isRepositoryRef({ ...api, host: '../github.com' })).toBe(false);
    expect(isRepositoryRef({ ...api, owner: 'acme/x' })).toBe(false);
    expect(isRepositoryRef({ ...api, repo: '.' })).toBe(false);
    expect(isRepositoryRef('acme/api')).toBe(false);
  });
});

describe('formatRepositoryRef', () => {
  it('names the host only when it is not github.com', () => {
    expect(formatRepositoryRef(api)).toBe('acme/api');
    expect(formatRepositoryRef({ ...api, host: 'github.example.com' })).toBe(
      'github.example.com/acme/api',
    );
  });
});

describe('isSameRepository', () => {
  it('ignores case, as GitHub does', () => {
    expect(isSameRepository(api, { ...api, owner: 'Acme', repo: 'API' })).toBe(true);
    expect(repositoryKey({ ...api, owner: 'Acme' })).toBe('github.com/acme/api');
    expect(isSameRepository(api, { ...api, repo: 'web' })).toBe(false);
    expect(isSameRepository(api, undefined)).toBe(false);
  });
});
