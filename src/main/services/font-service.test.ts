import { describe, expect, it, vi } from 'vitest';
import type { FontLibrary } from '../fonts/font-library';
import { createFontService } from './font-service';

function setup(paths: string[]) {
  const library: FontLibrary = {
    list: vi.fn().mockResolvedValue([]),
    add: vi
      .fn()
      .mockResolvedValue([
        { id: '0123456789abcdef', family: 'Hack', weight: 400, style: 'normal' },
      ]),
    read: vi.fn(),
    remove: vi.fn(),
  };
  const service = createFontService({
    library,
    chooseFiles: vi.fn().mockResolvedValue(paths),
    listInstalled: vi.fn().mockResolvedValue([]),
  });
  return { library, service };
}

describe('createFontService', () => {
  it('adds the font files the user picks', async () => {
    const { library, service } = setup(['/fonts/Hack-Regular.ttf']);

    await expect(service.addFonts()).resolves.toEqual([
      { id: '0123456789abcdef', family: 'Hack', weight: 400, style: 'normal' },
    ]);
    expect(library.add).toHaveBeenCalledWith(['/fonts/Hack-Regular.ttf']);
  });

  it('adds nothing when the file picker is cancelled', async () => {
    const { library, service } = setup([]);

    await expect(service.addFonts()).resolves.toEqual([]);
    expect(library.add).not.toHaveBeenCalled();
  });
});
