import { describe, expect, it } from 'vitest';
import {
  addRepository,
  matchesRepository,
  parseRepositoryList,
  removeRepository,
  repositoryOptions,
} from './repository-list';

const api = { host: 'github.com', owner: 'acme', repo: 'api' };
const web = { host: 'github.com', owner: 'acme', repo: 'web' };

describe('parseRepositoryList', () => {
  it('keeps valid repositories once, in order', () => {
    expect(
      parseRepositoryList([api, { ...api, owner: 'ACME' }, { ...web, extra: true }, 'acme/x']),
    ).toEqual([api, web]);
  });

  it('rejects anything that is not a list', () => {
    expect(parseRepositoryList({ api })).toBeUndefined();
  });
});

describe('addRepository and removeRepository', () => {
  it('adds a repository at the end once and removes it whatever its case', () => {
    expect(addRepository([api], web)).toEqual([api, web]);
    expect(addRepository([api], { ...api, repo: 'API' })).toEqual([api]);
    expect(removeRepository([api, web], { ...api, owner: 'Acme' })).toEqual([web]);
  });
});

describe('matchesRepository', () => {
  it('needs every word somewhere in the name, whatever the case', () => {
    expect(matchesRepository(api, 'ACME api')).toBe(true);
    expect(matchesRepository(api, 'web')).toBe(false);
    expect(matchesRepository({ ...api, host: 'github.example.com' }, 'example')).toBe(true);
    expect(matchesRepository(api, '  ')).toBe(true);
  });
});

describe('repositoryOptions', () => {
  const docs = { host: 'github.com', owner: 'acme', repo: 'docs' };

  it('suggests the repositories that match what was typed', () => {
    expect(repositoryOptions('acme/', [api, web, docs], 'github.com')).toEqual({
      suggestions: [api, web, docs],
    });
    expect(repositoryOptions('do', [api, web, docs], 'github.com')).toEqual({
      suggestions: [docs],
    });
  });

  it('offers a typed repository that is not among the suggestions', () => {
    const react = { host: 'github.com', owner: 'facebook', repo: 'react' };
    expect(repositoryOptions('facebook/react', [api], 'github.com')).toEqual({
      typed: react,
      suggestions: [],
    });
    expect(repositoryOptions('https://github.com/acme/api', [api], 'github.com')).toEqual({
      suggestions: [],
      typed: api,
    });
    expect(repositoryOptions('acme/api', [api], 'github.com')).toEqual({ suggestions: [api] });
  });
});
