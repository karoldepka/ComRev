import { resolve } from 'path';
import type { Plugin } from 'vite';

/** Stubs out the large local font JSON imports (Roboto, Inter) so they don't
 *  bloat the WC bundle. The WC uses CDN-based fonts only. */
function stubLocalFontsPlugin(): Plugin {
  const LOCAL_FONTS = ['Roboto_Regular.typeface.json', 'Inter_Regular.typeface.json'];
  const STUB = '\0virtual-font-stub';
  return {
    name: 'stub-local-fonts',
    enforce: 'pre',
    resolveId(source) {
      if (LOCAL_FONTS.some(n => source.includes(n))) return STUB;
    },
    load(id) {
      if (id === STUB) return 'export default {};';
    },
  };
}

/** At build time, replaces AVAILABLE_FONTS with only the default droid_sans entry.
 *  Strips ~2.5 KB of CDN URL strings for fonts the WC UI never exposes. */
function stripNonDefaultFontsPlugin(): Plugin {
  const REPLACEMENT =
    `export const AVAILABLE_FONTS: FontDef[] = [\n` +
    `  {\n` +
    `    id: 'droid_sans',\n` +
    `    label: 'Droid Sans',\n` +
    `    urls: [\n` +
    `      'https://threejs.org/examples/fonts/droid/droid_sans_regular.typeface.json',\n` +
    `      'https://unpkg.com/three@latest/examples/fonts/droid/droid_sans_regular.typeface.json',\n` +
    `    ],\n` +
    `  },\n` +
    `];`;
  return {
    name: 'strip-non-default-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('three-text-geometry.ts')) return null;
      const replaced = code.replace(
        /export const AVAILABLE_FONTS: FontDef\[\] = \[[\s\S]*?\n\];/,
        REPLACEMENT,
      );
      return replaced === code ? null : { code: replaced, map: null };
    },
  };
}

export function createWcBaseConfig() {
  return {
    plugins: [stubLocalFontsPlugin(), stripNonDefaultFontsPlugin()],
    resolve: {
      alias: [
        // Matches the @/ alias used in three-text-geometry.ts (-> fe/)
        { find: '@', replacement: resolve(__dirname, '..') },
        { find: /^three$/, replacement: resolve(__dirname, 'src/three-lite.js') },
        { find: /^three\/(.+)$/, replacement: resolve(__dirname, 'node_modules/three/$1') },
      ],
      dedupe: ['three'],
    },
  };
}
