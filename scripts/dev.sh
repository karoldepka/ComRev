#!/bin/bash

echo "🚀 Starting fullstack dev environment..."

concurrently \
  "cd be && uvicorn app.main:app --reload" \
  "cd fe && npx expo start" \
  "sleep 5 && npm run gen:api --prefix ."
  
