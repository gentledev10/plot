import { describe, expect, it, vi } from 'vitest';
import { CommandError } from '../system/process';
import { listInstalledFonts, parseInstalledFonts } from './installed-fonts';

describe('listInstalledFonts', () => {
  it('asks macOS for its font families and whether each is monospaced', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        { family: 'Menlo', monospaced: true },
        { family: 'Helvetica', monospaced: false },
      ]),
      stderr: '',
    });

    await expect(listInstalledFonts(run)).resolves.toEqual([
      { family: 'Helvetica', monospaced: false },
      { family: 'Menlo', monospaced: true },
    ]);
    expect(run).toHaveBeenCalledWith(
      'osascript',
      ['-l', 'JavaScript', '-e', expect.stringContaining('NSFixedPitchFontMask')],
      { timeoutMs: 10_000 },
    );
  });

  it('lists nothing when macOS cannot be asked', async () => {
    const run = vi.fn().mockRejectedValue(new CommandError('timeout', 'osascript', ''));
    await expect(listInstalledFonts(run)).resolves.toEqual([]);
  });
});

describe('parseInstalledFonts', () => {
  it('drops hidden system fonts and names a style could not hold', () => {
    expect(
      parseInstalledFonts(
        JSON.stringify([
          { family: '.SF NS Mono', monospaced: true },
          { family: 'Bad"Name', monospaced: true },
          { family: 'PT Mono', monospaced: 'yes' },
          { family: 'PT Mono', monospaced: true },
          'Courier',
        ]),
      ),
    ).toEqual([{ family: 'PT Mono', monospaced: true }]);
  });

  it('lists nothing for output it does not understand', () => {
    expect(parseInstalledFonts('')).toEqual([]);
    expect(parseInstalledFonts('{"family":"Menlo"}')).toEqual([]);
  });
});
