import { describe, expect, it } from 'vitest';
import { explainAiFailure } from './agent';
import { requireRestrictedMode, supportsRestrictedMode } from './compatibility';

describe('Claude Code compatibility', () => {
  it('rejects the installed older CLI and accepts the restricted-mode boundary', () => {
    expect(supportsRestrictedMode('2.1.76 (Claude Code)')).toBe(false);
    expect(supportsRestrictedMode('2.1.247')).toBe(false);
    expect(supportsRestrictedMode('2.1.248')).toBe(true);
    expect(supportsRestrictedMode('2.2.0')).toBe(true);
    expect(supportsRestrictedMode('unknown')).toBe(false);
    expect(() => requireRestrictedMode('2.1.76')).toThrow(/2.1.248/);
  });
  it('turns provider JSON errors into a recovery action', () => {
    const raw = JSON.stringify({
      error: {
        message: "The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account.",
      },
    });
    expect(explainAiFailure(raw)).toMatch(/Choose another model/);
    expect(explainAiFailure(raw)).not.toContain('{');
  });
});
