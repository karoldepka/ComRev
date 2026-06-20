import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createWcBaseConfig } from './vite.shared';

export default defineConfig({
  ...createWcBaseConfig(),
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/threed-text-wc.ts'),
      formats: ['es'],
      fileName: () => 'threed-text.js',
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.includes('/wc/node_modules/three/') ||
            normalized.endsWith('/wc/src/three-lite.js')
          ) {
            return 'three-runtime';
          }
          if (normalized.endsWith('/utils/three-text-geometry.ts')) {
            return 'text-geometry';
          }
        },
      },
    },
    sourcemap: false,
  },
});
