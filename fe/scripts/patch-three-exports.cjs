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

const alreadyPatched =
  exp['./examples/jsm/*.js'] === './examples/jsm/*.js' &&
  exp['./examples/jsm/*'] === './examples/jsm/*.js';

if (!alreadyPatched) {
  // Remove the broken bare wildcard that mapped bare paths to non-existent files.
  // Replace with two ordered entries:
  //   1. *.js → *.js  (exact match wins for imports that already have .js extension)
  //   2. *    → *.js  (bare imports like expo-three's get the .js appended automatically)
  delete exp['./examples/jsm/*'];
  exp['./examples/jsm/*.js'] = './examples/jsm/*.js';
  exp['./examples/jsm/*'] = './examples/jsm/*.js';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('patch-three-exports: patched exports wildcards');
} else {
  console.log('patch-three-exports: already patched, skipping');
}
