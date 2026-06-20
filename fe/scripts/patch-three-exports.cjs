#!/usr/bin/env node
// Patches three.js package.json exports to use explicit .js extensions.
// three's wildcard  "./examples/jsm/*": "./examples/jsm/*"  maps bare paths
// (e.g. OBJLoader) to paths without .js, which Metro warns are missing files.
// After this patch, bare imports fall back to Metro's file-based resolver
// (same behaviour, no warning); .js imports match the new explicit pattern.
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'node_modules', 'three', 'package.json');
if (!fs.existsSync(pkgPath)) process.exit(0);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const exp = pkg.exports || {};

if (exp['./examples/jsm/*'] === './examples/jsm/*') {
  delete exp['./examples/jsm/*'];
  exp['./examples/jsm/*.js'] = './examples/jsm/*.js';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('patch-three-exports: replaced bare wildcard with .js wildcard');
} else {
  console.log('patch-three-exports: already patched or unexpected format, skipping');
}
