import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { thirdPartyNotices } from './build/third-party-notices';

const alias = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias },
    plugins: [
      {
        name: 'use-maintained-dompurify',
        enforce: 'pre',
        resolveId(source, importer) {
          if (importer?.includes('/monaco-editor/') && source.endsWith('/dompurify/dompurify.js')) {
            return resolve('node_modules/dompurify/dist/purify.es.mjs');
          }
        },
      },
      react(),
      thirdPartyNotices(),
    ],
  },
});
