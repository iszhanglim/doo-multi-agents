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

# ---- 1) 根依赖（tsx / pg / openai / bcrypt / dotenv / uuid） ----------------
# 优先用 lock 做可复现安装；lock 与 package.json 失配时退回 install
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
 || npm install --no-audit --no-fund

# ---- 2) 前端依赖（express / cors / body-parser / react / vite / tsx） -----
COPY web/package.json web/package-lock.json ./web/
RUN cd web \
 && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)

# ---- 3) 源码（.dockerignore 已排除 node_modules / .env / dist / venv） -----
COPY . .

# ---- 4) 构建前端 -> web/dist，交由后端静态托管 ----------------------------
RUN cd web && npm run build

EXPOSE 3001

# 就绪探针：命中 /api/health 才算健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
