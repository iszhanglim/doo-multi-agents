#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# 说明：这里刻意不 source .env。
#   `. .env` 等于把该文件当 shell 脚本执行（任意代码执行面）；
#   而且未加引号的 JSON 值（如 LLM_EXTRA_BODY={"thinking":{"type":"disabled"}}）
#   会被 shell 解析，极易踩坑；`set -a` 还会把 .env 里的一切（含误写的 PATH）导出。
# .env 统一交给 web/server/index.ts 里的 dotenv 加载：config({ path: resolve(__dirname, '../../.env') })。
# 若确实需要在 shell 侧先取少量变量（如端口），请逐行解析并显式 export，不要 eval。

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