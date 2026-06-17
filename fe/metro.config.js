const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable package.json `exports` field resolution (required for Zustand v5+)
config.resolver.unstable_enablePackageExports = true;

// When deployed in a subdirectory (e.g. Vercel with repo root above fe/),
// Metro walks up and tries to stat a non-existent node_modules at the repo root.
// Pin the resolver to only look inside fe/node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// ── Warn logger: suppress stack traces on screen, write full details to file ──
// The naive approach (calling the original console.warn) doesn't work because
// Expo CLI's serverLogLikeMetro.ts replaces console.warn and re-adds the stack.
// Fix: write to stderr directly and lock console.warn via defineProperty so
// any later replacement attempt by Expo CLI is silently ignored.

const LOG_FILE = path.resolve(__dirname, 'metro.warn.log');

function suppressedWarn(...args) {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const stack = new Error().stack?.split('\n').slice(2).join('\n') ?? '';
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] WARN: ${text}\n${stack}\n\n`); } catch { /* ignore */ }
  process.stderr.write(`\x1b[33m WARN \x1b[0m ${text}\n`);
}

try {
  Object.defineProperty(console, 'warn', {
    get: () => suppressedWarn,
    set: () => {},    // silently ignore Expo CLI's attempt to replace console.warn
    configurable: true,
    enumerable: true,
  });
} catch {
  console.warn = suppressedWarn;
}

module.exports = config;
