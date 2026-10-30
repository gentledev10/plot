import { devNull } from 'node:os';
import { describe, expect, it } from 'vitest';
import { basicAuthHeader, isolatedGitEnvironment } from './environment';

describe('isolatedGitEnvironment', () => {
  it('ignores the user and system git config', () => {
    const env = isolatedGitEnvironment({ PATH: '/usr/bin', HOME: '/Users/someone' });
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/Users/someone',
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    });
  });

  it('drops inherited variables that would point git somewhere else', () => {
    const env = isolatedGitEnvironment({
      GIT_DIR: '/elsewhere/.git',
      GIT_WORK_TREE: '/elsewhere',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.sshCommand',
      GIT_CONFIG_VALUE_0: 'evil',
      GIT_CONFIG_PARAMETERS: "'core.hooksPath'='/tmp'",
    });
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
    expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined();
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined();
  });

  it('sends the token only to github.com, through config in the environment', () => {
    const env = isolatedGitEnvironment({}, basicAuthHeader('gho_secret'));
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    });
    expect(env.GIT_CONFIG_VALUE_0).toBe(basicAuthHeader('gho_secret'));
  });

  it('does not modify the environment it was given', () => {
    const base = { GIT_DIR: '/x' };
    isolatedGitEnvironment(base, 'header');
    expect(base).toEqual({ GIT_DIR: '/x' });
  });
});

describe('basicAuthHeader', () => {
  it('encodes the token the way GitHub expects for HTTPS git', () => {
    const header = basicAuthHeader('gho_secret');
    const encoded = header.replace('AUTHORIZATION: basic ', '');
    expect(Buffer.from(encoded, 'base64').toString()).toBe('x-access-token:gho_secret');
  });
});
