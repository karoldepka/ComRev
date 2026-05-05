#!/bin/bash

echo "🔁 Generating API types directly from server..."

until curl -s http://localhost:8000/openapi.json > /dev/null; do
  sleep 1
done

npx openapi-typescript http://localhost:8000/openapi.json \
  -o packages/api/types.ts

echo "✅ Done"
