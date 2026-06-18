import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

/** Stubs out the large local font JSON imports (Roboto, Inter) so they don't
 *  bloat the WC bundle. The WC uses CDN-based fonts only. */
function stubLocalFontsPlugin(): Plugin {
  const LOCAL_FONTS = ['Roboto_Regular.typeface.json', 'Inter_Regular.typeface.json'];
  const STUB = '\0virtual-font-stub';
  return {
    name: 'stub-local-fonts',
    enforce: 'pre',
    resolveId(source) {
      if (LOCAL_FONTS.some(n => source.includes(n))) {
        return STUB;
      }
    },
    load(id) {
      if (id === STUB) return 'export default {};';
    },
  };
}

export default defineConfig({
  plugins: [stubLocalFontsPlugin()],
  resolve: {
    alias: {
      // Matches the @/ alias used in three-text-geometry.ts (→ fe/)
      '@': resolve(__dirname, '..'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/threed-text-wc.ts'),
      name: 'ThreedTextWC',
      formats: ['es', 'umd'],
      fileName: (fmt) => fmt === 'es' ? 'threed-text.js' : 'threed-text.umd.js',
    },
    rollupOptions: {
      // Keep all of Three.js (including examples/jsm/*) external so the consumer
      // shares one copy.  The Angular app just needs: npm install three
      // Remove `external` below if you want a single fully self-contained bundle.
      external: (id) => id === 'three' || id.startsWith('three/'),
      output: {
        globals: { three: 'THREE' },
      },
    },
    sourcemap: true,
  },
});
