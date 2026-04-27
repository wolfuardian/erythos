#!/usr/bin/env bash
# Erythos dev launcher (POSIX equivalent of launch.bat)
set -e

cd "$(dirname "$0")/.."

# Kill any existing process listening on port 3000
PID=$(lsof -ti tcp:3000 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "Killing existing dev server on port 3000 (PID $PID)..."
  kill -9 "$PID" 2>/dev/null || true
fi

echo "Starting Erythos..."
npm run dev -- --open
