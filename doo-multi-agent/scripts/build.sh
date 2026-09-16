#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"
pnpm install --frozen-lockfile || pnpm install

cd "$PROJECT_DIR/web"
pnpm install --frozen-lockfile || pnpm install
pnpm run build