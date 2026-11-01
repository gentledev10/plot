import type { AddedFont } from '@shared/fonts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { fontKeys } from './queries';

const regular: AddedFont = { id: '0123456789abcdef', family: 'Hack', weight: 400, style: 'normal' };
const italic: AddedFont = { id: 'fedcba9876543210', family: 'Hack', weight: 400, style: 'italic' };
const faces = () =>
  [...document.fonts].map((face) => `${face.family} ${face.weight} ${face.style}`).sort();

describe('useAddedFontFaces', () => {
  it('loads the fonts added to Plot and tells open editors to measure them', async () => {
    const reported = vi.spyOn(document.fonts, 'dispatchEvent');
    const readAddedFont = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    renderWithApi(<p>Plot</p>, {
      listAddedFonts: vi.fn().mockResolvedValue([regular, italic]),
      readAddedFont,
    });

    await vi.waitFor(() => expect(faces()).toEqual(['Hack 400 italic', 'Hack 400 normal']));
    expect(readAddedFont).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(
        reported.mock.calls.map(([event]) => [
          event.type,
          (event as FontFaceSetLoadEvent).fontfaces.length,
        ]),
      ).toEqual([
        ['loadingdone', 1],
        ['loadingdone', 1],
      ]),
    );
    reported.mockRestore();
  });

  it('stops using a font once it is removed', async () => {
    const { queryClient } = renderWithApi(<p>Plot</p>, {
      listAddedFonts: vi.fn().mockResolvedValue([regular, italic]),
      readAddedFont: vi.fn().mockResolvedValue(new Uint8Array()),
    });
    await vi.waitFor(() => expect(faces()).toHaveLength(2));

    queryClient.setQueryData(fontKeys.added, [italic]);

    await vi.waitFor(() => expect(faces()).toEqual(['Hack 400 italic']));
  });

  it('skips a font that cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithApi(<p>Plot</p>, {
      listAddedFonts: vi.fn().mockResolvedValue([regular]),
      readAddedFont: vi.fn().mockRejectedValue(new Error('That font is no longer in Plot.')),
    });

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(faces()).toEqual([]);
    warn.mockRestore();
  });
});
