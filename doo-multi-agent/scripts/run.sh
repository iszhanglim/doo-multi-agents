#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

EXPOSE_PORT=$(awk -F '[ =]+' '/^expose_port/ {gsub(/[^0-9]/, "", $2); print $2; exit}' .preview 2>/dev/null || echo 5000)
export PORT="$EXPOSE_PORT"

fuser -k "${EXPOSE_PORT}/tcp" 2>/dev/null || true
sleep 1

cd "$PROJECT_DIR/web"
exec pnpm exec tsx server/index.ts