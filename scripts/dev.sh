#!/bin/bash

set -e

REPO_ROOT="."

echo "🚀 Starting backend..."

cd $REPO_ROOT/services/api
PYTHONPATH=. uv run uvicorn app.main:app --reload &
BE_PID=$!

echo "⏳ Waiting for backend health..."
until curl -s http://localhost:8000/openapi.json > openapi.json; do
  sleep 1
done

echo "🔁 Generating API types..."
cd $REPO_ROOT
pnpm gen:api

echo "📱 Starting frontend..."
cd $REPO_ROOT/apps/mobile
npx expo start --port 8082 &
FE_PID=$!

wait $BE_PID $FE_PID