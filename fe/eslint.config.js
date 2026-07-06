// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  {
    ignores: ['.expo/**', 'dist/**', 'web-build/**', 'wc/dist/**'],
  },
  expoConfig,
  prettierConfig,
  {
    files: ['scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
]);
