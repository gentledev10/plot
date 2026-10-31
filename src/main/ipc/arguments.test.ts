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
    ).toEqual([{ provider: 'codex', models: { codex: 'gpt-5.1-codex' } }]);
    expect(
      argumentParsers.updateAiSettings([
        { provider: 'claude-code', models: { 'claude-code': '--dangerously-skip-permissions' } },
      ]),
    ).toEqual([{ provider: 'claude-code', models: {} }]);
    expect(() => argumentParsers.updateAiSettings([{ provider: 'gpt', models: {} }])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('rejects a missing pull request reference', () => {
    expect(() => argumentParsers.getPullRequest([])).toThrow(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });
});
