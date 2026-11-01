import { describe, expect, it } from 'vitest';
import { argumentParsers } from './arguments';

const ref = { host: 'github.com', owner: 'octocat', repo: 'hello-world', number: 42 };
const blob = 'a'.repeat(40);

describe('argumentParsers', () => {
  it('takes no arguments for parameterless methods, whatever the renderer sends', () => {
    expect(argumentParsers.listAccounts(['ignored'])).toEqual([]);
    expect(argumentParsers.listInbox([])).toEqual([]);
  });

  it('copies only the known fields of a pull request reference', () => {
    expect(argumentParsers.getPullRequestDiff([{ ...ref, __proto__: { polluted: true } }])).toEqual(
      [ref],
    );
  });

  it('accepts SHA-1 and SHA-256 object ids', () => {
    expect(argumentParsers.readBlob([ref, blob])).toEqual([ref, blob]);
    expect(argumentParsers.readBlob([ref, 'b'.repeat(64)])).toEqual([ref, 'b'.repeat(64)]);
  });

  it.each([
    ['an abbreviated id', 'abc123'],
    ['a revision expression', 'HEAD:src/app.ts'],
    ['an option', '--output=/tmp/x'],
    ['an uppercase id', 'A'.repeat(40)],
    ['a number', 42],
  ])('rejects %s where an object id is expected', (_name, value) => {
    expect(() => argumentParsers.readBlob([ref, value])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('checks account ids, hosts, and tokens', () => {
    expect(argumentParsers.switchAccount(['github.com/mona'])).toEqual(['github.com/mona']);
    expect(argumentParsers.signInWithGitHubCli(['github.example.com'])).toEqual([
      'github.example.com',
    ]);
    expect(
      argumentParsers.signInWithToken([{ host: 'github.com', token: 'ghp_abc', extra: 1 }]),
    ).toEqual([{ host: 'github.com', token: 'ghp_abc' }]);

    const invalid = expect.objectContaining({ code: 'invalid-argument' });
    expect(() => argumentParsers.removeAccount(['../mona'])).toThrow(invalid);
    expect(() => argumentParsers.signInWithGitHubCli(['github.com; rm -rf /'])).toThrow(invalid);
    expect(() =>
      argumentParsers.signInWithToken([{ host: 'github.com', token: 'ghp abc' }]),
    ).toThrow(invalid);
    expect(() => argumentParsers.signInWithToken([{ host: 'github.com', token: '' }])).toThrow(
      invalid,
    );
    expect(() => argumentParsers.finishBrowserSignIn(['not-a-uuid'])).toThrow(invalid);
  });

  it('accepts known AI providers and plain model names only', () => {
    expect(
      argumentParsers.updateAiSettings([{ provider: 'codex', models: { codex: 'gpt-5.1-codex' } }]),
    ).toEqual([{ provider: 'codex', models: { codex: 'gpt-5.1-codex' }, efforts: {}, auth: {} }]);
    expect(
      argumentParsers.updateAiSettings([
        { provider: 'claude-code', models: { 'claude-code': '--dangerously-skip-permissions' } },
      ]),
    ).toEqual([{ provider: 'claude-code', models: {}, efforts: {}, auth: {} }]);
    expect(() => argumentParsers.updateAiSettings([{ provider: 'gpt', models: {} }])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('accepts an API key only for a known tool, trimmed, and without spaces', () => {
    const key = `sk-ant-api03-${'a'.repeat(40)}`;
    expect(argumentParsers.saveAiApiKey(['claude-code', `  ${key}\n`])).toEqual([
      'claude-code',
      key,
    ]);
    expect(argumentParsers.removeAiApiKey(['codex'])).toEqual(['codex']);

    const invalid = expect.objectContaining({ code: 'invalid-argument' });
    expect(() => argumentParsers.saveAiApiKey(['gpt', key])).toThrow(invalid);
    expect(() => argumentParsers.saveAiApiKey(['codex', 'my secret key'])).toThrow(invalid);
    expect(() => argumentParsers.saveAiApiKey(['codex', 42])).toThrow(invalid);
    expect(() => argumentParsers.removeAiApiKey(['../codex'])).toThrow(invalid);
  });

  it('accepts local repositories only by id, and paths only inside them', () => {
    const id = '0123456789abcdef';
    expect(
      argumentParsers.getLocalDiff([{ repositoryId: id, compare: 'branch', path: '/' }]),
    ).toEqual([{ repositoryId: id, compare: 'branch' }]);
    expect(argumentParsers.readLocalFile([id, 'src/app.ts'])).toEqual([id, 'src/app.ts']);

    const invalid = expect.objectContaining({ code: 'invalid-argument' });
    expect(() =>
      argumentParsers.getLocalDiff([{ repositoryId: '/Users/me', compare: 'branch' }]),
    ).toThrow(invalid);
    expect(() => argumentParsers.getLocalDiff([{ repositoryId: id, compare: 'all' }])).toThrow(
      invalid,
    );
    expect(() => argumentParsers.readLocalFile([id, '../secret'])).toThrow(invalid);
    expect(() => argumentParsers.readLocalFile([id, '/etc/passwd'])).toThrow(invalid);
    expect(() => argumentParsers.readLocalBlob([id, 'HEAD:src/app.ts'])).toThrow(invalid);
  });

  it('accepts repositories and pages of their pull requests', () => {
    const repository = { host: 'github.com', owner: 'acme', repo: 'api' };
    const invalid = expect.objectContaining({ code: 'invalid-argument' });

    expect(argumentParsers.findRepository([{ ...repository, number: 3 }])).toEqual([repository]);
    expect(() => argumentParsers.countOpenPullRequests([{ ...repository, repo: '..' }])).toThrow(
      invalid,
    );
    const query = { repository, state: 'merged', scope: 'authored', text: 'label:bug', page: 2 };
    expect(argumentParsers.listRepositoryPullRequests([{ ...query, extra: 1 }])).toEqual([query]);
    for (const change of [
      { page: 0 },
      { page: 1.5 },
      { page: '2' },
      { page: 101 },
      { state: 'draft' },
      { scope: 'mine' },
      { text: 'a\nb' },
      { text: 'x'.repeat(257) },
    ]) {
      expect(() => argumentParsers.listRepositoryPullRequests([{ ...query, ...change }])).toThrow(
        invalid,
      );
    }
  });

  it('rejects a missing pull request reference', () => {
    expect(() => argumentParsers.getPullRequest([])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });
});
