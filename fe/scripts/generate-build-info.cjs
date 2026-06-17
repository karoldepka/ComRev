#!/usr/bin/env node
// Writes git-build-info.json with current git state.
// Run this before deploying so Vercel uploads the fresh version.
'use strict';
const { execSync } = require('child_process');
const { writeFileSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: root }).trim();
}

let info;
try {
  const hash     = run('git rev-parse --short HEAD');
  const fullHash = run('git rev-parse HEAD');
  const message  = run('git log -1 --pretty=format:%s');
  const date     = run('git log -1 --pretty=format:%ci');
  const author   = run('git log -1 --pretty=format:%an');
  const branch   = run('git rev-parse --abbrev-ref HEAD');
  let dirty = '';
  try {
    if (run('git status --porcelain')) dirty = '+uncommitted';
  } catch { /* ignore */ }
  info = { hash: hash + dirty, fullHash, message, date, author, branch };
} catch (err) {
  console.error('generate-build-info: git unavailable:', err.message);
  process.exit(1);
}

const outPath = resolve(root, 'git-build-info.json');
writeFileSync(outPath, JSON.stringify(info, null, 2) + '\n');
console.log(`git-build-info.json written: ${info.hash}`);
