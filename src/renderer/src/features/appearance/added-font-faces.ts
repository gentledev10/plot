import type { AddedFont } from '@shared/fonts';
import { useEffect, useRef } from 'react';
import { useApi } from '../../app/providers';
import { useAddedFonts } from './queries';

export function useAddedFontFaces(): void {
  const api = useApi();
  const fonts = useAddedFonts().data;
  const faces = useRef(new Map<string, Promise<FontFace | undefined>>());

  useEffect(() => {
    if (!fonts) {
      return;
    }
    const loaded = faces.current;
    const ids = new Set(fonts.map((font) => font.id));
    for (const [id, face] of loaded) {
      if (!ids.has(id)) {
        loaded.delete(id);
        void face.then((value) => value && document.fonts.delete(value));
      }
    }
    for (const font of fonts) {
      if (!loaded.has(font.id)) {
        loaded.set(font.id, loadFace(font, api.readAddedFont(font.id)));
      }
    }
  }, [api, fonts]);
}

async function loadFace(
  font: AddedFont,
  bytes: Promise<Uint8Array<ArrayBuffer>>,
): Promise<FontFace | undefined> {
  let face: FontFace | undefined;
  try {
    face = new FontFace(font.family, await bytes, {
      weight: String(font.weight),
      style: font.style,
    });
    document.fonts.add(face);
    await face.load();
    // A face made from bytes starts loading before it joins the set, so the set never reports
    // it. Report it here, so open editors measure the new font.
    document.fonts.dispatchEvent(new FontFaceSetLoadEvent('loadingdone', { fontfaces: [face] }));
    return face;
  } catch (error) {
    if (face) {
      document.fonts.delete(face);
    }
    console.warn(`[fonts] could not load ${font.family}`, error);
    return undefined;
  }
}
