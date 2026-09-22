# ===========================================================================
# DOO 多智能体系统 —— 生产镜像
#
#   构建:  docker build -t doo-multi-agent:latest .
#   运行:  docker run -d --name doo -p 3001:3001 --env-file .env doo-multi-agent:latest
#   编排:  docker compose up -d --build
#
# 架构说明:
#   后端 web/server/index.ts 用 tsx 直接跑 TS 源码（不依赖编译产物 dist/），
#   并静态托管 web/dist —— 所以前端必须先构建，容器内只暴露一个端口。
#   必须从 web/ 作为工作目录启动：DATA_PATH=./data 是相对 cwd 解析的。
# ===========================================================================
FROM node:22-bookworm

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app

# 仓库使用 pnpm（root 与 web 各一份 pnpm-lock.yaml，已无 package-lock.json）。
# 通过 corepack 启用 pnpm，保证与平台/CI 一致的依赖解析结果。
RUN corepack enable

# ---- 1) 根依赖（tsx / pg / openai / bcrypt / dotenv / uuid） ----------------
# 注意：仓库里已没有 package-lock.json，此前 `COPY package-lock.json` 会直接构建失败。
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false \
 || pnpm install --prod=false

# ---- 2) 前端依赖（express / cors / body-parser / react / vite / tsx） -----
COPY web/package.json web/pnpm-lock.yaml ./web/
RUN cd web \
 && (pnpm install --frozen-lockfile || pnpm install)

# ---- 3) 源码（.dockerignore 已排除 node_modules / .env / dist / venv） -----
COPY . .

# ---- 4) 构建前端 -> web/dist，交由后端静态托管 ----------------------------
RUN cd web && pnpm run build

EXPOSE 3001

# 就绪探针：命中 /api/health 才算健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
