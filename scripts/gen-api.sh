#!/bin/bash

echo "🔁 Generating API types..."

npx openapi-typescript http://localhost:8000/openapi.json \
  -o packages/api/types.ts

echo "✅ API types generated"
