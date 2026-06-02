#!/usr/bin/env bash
# Build the sync_core WASM module and copy output to structable/public/wasm/
# Requires: wasm-pack (cargo install wasm-pack)
# Watch mode also requires: watchexec (cargo install watchexec-cli)
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/build-wasm.sh [--watch|-w]

Builds sync_core for the browser and writes wasm-pack output to
structable/public/wasm/.

Options:
  -w, --watch   Rebuild when sync_core, structable_logger, or proto changes.
  -h, --help    Show this help.
USAGE
}

WATCH=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -w|--watch)
      WATCH=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/structable/public/wasm"

build_wasm() {
  echo "Building sync_core WASM..."
  cd "$REPO_ROOT/sync_core"

  # --target web: generates ES modules + .wasm; Next.js serves from public/.
  if ! time wasm-pack build \
    --target web \
    --out-dir "$OUT_DIR" \
    --release; then
    return 1
  fi

  echo "WASM output written to $OUT_DIR"
  echo "Files:"
  ls -lh "$OUT_DIR"
}

watch_wasm() {
  if ! command -v watchexec >/dev/null 2>&1; then
    echo "Watch mode requires watchexec. Install it with: cargo install watchexec-cli" >&2
    exit 127
  fi

  build_wasm || echo "Initial WASM build failed; watching for fixes."

  echo "Watching sync_core, structable_logger, proto, and this script with watchexec."
  echo "Press Ctrl+C to stop."
  cd "$REPO_ROOT"

  exec watchexec \
    --watch "$REPO_ROOT/sync_core" \
    --watch "$REPO_ROOT/structable_logger" \
    --watch "$REPO_ROOT/proto" \
    --watch "$REPO_ROOT/scripts/build-wasm.sh" \
    -- bash "$REPO_ROOT/scripts/build-wasm.sh"
}

if [[ "$WATCH" -eq 1 ]]; then
  watch_wasm
else
  build_wasm
fi
