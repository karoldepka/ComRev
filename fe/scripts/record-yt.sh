#!/usr/bin/env bash
# Quick launcher: Record YouTube landscape (1920x1080 @ 60fps)
# Usage: ./record-yt.sh [duration_seconds] [output_name]
#   ./record-yt.sh 30
#   ./record-yt.sh 45 my-animation

DURATION="${1:-30}"
OUTPUT="${2:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$OUTPUT" ]]; then
    powershell.exe -ExecutionPolicy Bypass -File "$DIR/record.ps1" -Format yt -Duration "$DURATION"
else
    powershell.exe -ExecutionPolicy Bypass -File "$DIR/record.ps1" -Format yt -Duration "$DURATION" -Output "$OUTPUT"
fi
