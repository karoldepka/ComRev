#!/bin/bash

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting ComRev backend..."
cd "$REPO_ROOT/backend"
uv run uvicorn app.main:app --reload --port 8000 &
BE_PID=$!

echo "Waiting for backend health..."
until curl -sf http://localhost:8000/health > /dev/null; do
  sleep 1
done
echo "Backend ready."

echo "Starting Next.js web..."
cd "$REPO_ROOT/web"
pnpm dev &
WEB_PID=$!

echo "Starting Expo..."
cd "$REPO_ROOT/fe"
pnpm start &
FE_PID=$!

wait $BE_PID $WEB_PID $FE_PID
