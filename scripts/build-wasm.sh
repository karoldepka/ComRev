#!/usr/bin/env bash
# Build the sync_core WASM module and copy output to structable/public/wasm/
# Requires: wasm-pack (cargo install wasm-pack)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/structable/public/wasm"

echo "Building sync_core WASM..."
cd "$REPO_ROOT/sync_core"

# --target web: generates ES modules + .wasm — Next.js serves from public/
time  wasm-pack build \
  --target web \
  --out-dir "$OUT_DIR" \
  --release

echo "WASM output written to $OUT_DIR"
echo "Files:"
ls -lh "$OUT_DIR"
