#!/usr/bin/env bash
# Quick launcher: Record YouTube Shorts (1080x1920 portrait @ 60fps)
# Usage: ./record-shorts.sh [duration_seconds] [output_name]
#   ./record-shorts.sh 15
#   ./record-shorts.sh 30 my-short

DURATION="${1:-15}"
OUTPUT="${2:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$OUTPUT" ]]; then
    powershell.exe -ExecutionPolicy Bypass -File "$DIR/record.ps1" -Format shorts -Duration "$DURATION"
else
    powershell.exe -ExecutionPolicy Bypass -File "$DIR/record.ps1" -Format shorts -Duration "$DURATION" -Output "$OUTPUT"
fi
