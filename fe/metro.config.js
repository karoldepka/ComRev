const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable package.json `exports` field resolution (required for Zustand v5+)
config.resolver.unstable_enablePackageExports = true;

// When deployed in a subdirectory (e.g. Vercel with repo root above fe/),
// Metro walks up and tries to stat a non-existent node_modules at the repo root.
// Pin the resolver to only look inside fe/node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
