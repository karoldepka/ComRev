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

const LOG_FILE = path.resolve(__dirname, 'metro.warn.log');

const _warn = console.warn.bind(console);
console.warn = function (...args) {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  // Write full entry (with stack) to log file
  const stack = new Error().stack?.split('\n').slice(2).join('\n') ?? '';
  const entry = `[${new Date().toISOString()}] WARN: ${text}\n${stack}\n\n`;
  try { fs.appendFileSync(LOG_FILE, entry); } catch { /* ignore */ }
  // Print only the message — no stack trace
  _warn(text);
};

module.exports = config;
