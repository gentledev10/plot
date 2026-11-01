import type { InstalledFont } from '@shared/fonts';
import type { PlotApi } from '@shared/ipc';
import type { FontLibrary } from '../fonts/font-library';

export type FontService = Pick<
  PlotApi,
  'listInstalledFonts' | 'listAddedFonts' | 'addFonts' | 'readAddedFont' | 'removeAddedFont'
>;

interface FontServiceOptions {
  library: FontLibrary;
  chooseFiles(): Promise<string[]>;
  listInstalled(): Promise<InstalledFont[]>;
}

export function createFontService({
  library,
  chooseFiles,
  listInstalled,
}: FontServiceOptions): FontService {
  return {
    listInstalledFonts: listInstalled,

    listAddedFonts() {
      return library.list();
    },

    async addFonts() {
      const paths = await chooseFiles();
      return paths.length === 0 ? [] : library.add(paths);
    },

    readAddedFont(id) {
      return library.read(id);
    },

    removeAddedFont(family) {
      return library.remove(family);
    },
  };
}
