import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createWcBaseConfig } from './vite.shared';

export default defineConfig({
  ...createWcBaseConfig(),
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/threed-text-wc.ts'),
      name: 'ThreedTextWC',
      formats: ['umd'],
      fileName: () => 'threed-text.umd.js',
    },
    sourcemap: false,
  },
});
