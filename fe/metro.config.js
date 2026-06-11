const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package.json `exports` field resolution (required for Zustand v5+)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
