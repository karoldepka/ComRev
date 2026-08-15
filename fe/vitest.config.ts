import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

// Mirrors tsconfig.json's "@/*" -> "./*" path mapping, so tests can import
// app code the same way the app itself does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
