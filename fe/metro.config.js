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

// Expo auto-detects the pnpm workspace (repo-root pnpm-workspace.yaml) and adds
// the workspace root's node_modules plus sibling packages to config.watchFolders.
// Metro's Transformer statSyncs every entry in watchFolders on startup and
// crashes if one doesn't exist. On Vercel only fe/node_modules gets installed
// (the repo root is never `pnpm install`-ed there), so drop any watch folder
// that isn't actually present instead of letting Metro fail to construct.
config.watchFolders = config.watchFolders.filter((folder) => fs.existsSync(folder));

// ── Warn logger: suppress stack traces on screen, write full details to file ──
// The naive approach (calling the original console.warn) doesn't work because
// Expo CLI's serverLogLikeMetro.ts replaces console.warn and re-adds the stack.
// Fix: write to stderr directly and lock console.warn via defineProperty so
// any later replacement attempt by Expo CLI is silently ignored.

const LOG_FILE = path.resolve(__dirname, 'metro.warn.log');

// Patterns for known-harmless Metro warnings that clutter the console.
// Metro falls back correctly in all these cases; the packages just have stale exports maps.
const SUPPRESSED_WARN_PATTERNS = [
  /node_modules[\\/]three[\\/].*invalid package\.json/,
];

function suppressedWarn(...args) {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (SUPPRESSED_WARN_PATTERNS.some((re) => re.test(text))) return;
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
