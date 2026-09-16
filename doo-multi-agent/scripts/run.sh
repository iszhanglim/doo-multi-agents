#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

EXPOSE_PORT=$(awk -F '[ =]+' '/^expose_port/ {gsub(/[^0-9]/, "", $2); print $2; exit}' .preview 2>/dev/null || echo 5000)
export PORT="$EXPOSE_PORT"

# 数据库连接：平台通过 PGDATABASE_URL（或 workload identity）注入内置 PostgreSQL
# 项目 src/index.ts 读取 DATABASE_URL 启用 PostgreSQL 存储；未设置则回落 JSON 文件存储。
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${PGDATABASE_URL:-}" ]; then
    export DATABASE_URL="$PGDATABASE_URL"
  else
    DB_URL=$(timeout 20 python3 -c "from coze_workload_identity import Client; c=Client(); evs=c.get_project_env_vars(); c.close(); print(next((ev.value for ev in evs if ev.key=='PGDATABASE_URL'),''))" 2>/dev/null || true)
    [ -n "$DB_URL" ] && export DATABASE_URL="$DB_URL"
  fi
  [ -n "${DATABASE_URL:-}" ] && echo "📦 已启用 PostgreSQL（DATABASE_URL 来自平台注入）"
fi

fuser -k "${EXPOSE_PORT}/tcp" 2>/dev/null || true
sleep 1

cd "$PROJECT_DIR/web"
exec pnpm exec tsx server/index.ts