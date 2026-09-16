# 部署指南 —— DOO 多智能体系统

面向"部署到远程服务器、供其他人访问"的场景。三条路径任选其一，**所需环境变量完全一致**。

---

## 0. 一句话结论

| | Railway | 自有 Linux 服务器 | 任意云主机 + Docker |
|---|---|---|---|
| 成本 | **$5/月** 起（免费额度 $1/月**跑不动**本项目，见 §5） | ¥24–60/月（轻量应用服务器） | 同左 |
| 上手 | 连 GitHub 自动构建，~5 分钟 | 需装 Node/Nginx/systemd | 需装 Docker |
| HTTPS | 自动 | 需 certbot | 需自己配或平台提供 |
| 国内访问 | 不稳定（`*.up.railway.app`） | 快 | 取决于机房 |
| 合规（境内幼儿数据） | ⚠️ 数据出境 | ✅ 最稳妥 | ✅ 可行 |
| 推荐度 | 试用/演示 | **生产首选** | 次选 |

> 项目里已有 `railway.json`（NIXPACKS 构建），Railway 路径开箱可用。
> Docker 与裸机路径的配套文件已随仓库提供：`Dockerfile`、`docker-compose.yml`、
> `deploy/nginx.conf`、`deploy/doo-multi-agent.service`。

---

## 1. 必需环境变量

`.env` **已被 `.gitignore` 忽略**，不会进仓库也不会进镜像 → 必须在部署环境单独配置。

| 变量 | 必填 | 值 / 说明 |
|---|---|---|
| `LLM_PROVIDER` | ✅ | `custom` |
| `LLM_API_KEY` | ✅ | DeepSeek 密钥。**只写到服务器**，不要提交 |
| `LLM_BASE_URL` | ✅ | `https://api.deepseek.com/v1/chat/completions` |
| `LLM_MODEL` | ✅ | `deepseek-chat` |
| `PORT` | ⬜ | 缺省 `3001`。Railway 会自动注入，**不要写死** |
| `DATABASE_URL` | ⚠️ | **多人使用必填**。设置后自动切 PostgreSQL，见 §4 |
| `DATA_PATH` | ⬜ | JSON 模式下的数据目录（相对 cwd），缺省 `./data` |
| `ACCESS_CODE` | ⚠️ **公网必填** | 共享访问口令。设置后除 `/api/health` 外全部请求需 HTTP Basic 认证（用户名任意，密码填该值）。**不设置则接口完全公开** |
| `ACCESS_REALM` | ⬜ | Basic 认证提示语，默认 `DOO Multi-Agent` |
| `RATE_LIMIT_PER_MIN` | ⬜ | 每 IP 每分钟 `/api/*` 上限，默认 `120`；设 `0` 关闭 |
| `EDGE_TTS_PYTHON` | ⬜ | TTS 用的 python 可执行文件，见 §6 |
| `STT_PYTHON` / `STT_MODEL` | ⬜ | STT 用的 python / whisper 模型大小 |

**两个必须知道的细节（已核对源码）**

1. `LLM_BASE_URL` 是**完整 endpoint**，不是 SDK 的 baseURL。
   代码 `src/nlp/LLMClient.ts:113` 直接 `fetch(this.config.baseURL)`。
   → 保留 `/v1/chat/completions` 后缀，**不要**"修正"成 `/v1`。
2. `.env` 的读取路径是 `web/server/index.ts:6` 的 `resolve(__dirname,'../../.env')`，
   即**仓库根目录的 `.env`**。容器里 `WORKDIR=/app`，所以放 `/app/.env`；
   但本镜像用 `.dockerignore` 排除了它，请改用 `--env-file` / compose 的 `env_file`。

---

## 2. 路径 A：Docker Compose（自有云主机，推荐生产用）

```bash
# --- 服务器准备（Ubuntu / Debian 示例）---
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx
sudo systemctl enable --now docker

# --- 拉代码 ---
sudo git clone https://github.com/iszhanglimm/doo-multi-agent.git /opt/doo-multi-agent
cd /opt/doo-multi-agent

# --- 写 .env（密钥只在服务器上，不要 scp 明文到处传）---
sudo tee .env >/dev/null <<'EOF'
LLM_PROVIDER=custom
LLM_API_KEY=sk-在此填入真实密钥
LLM_BASE_URL=https://api.deepseek.com/v1/chat/completions
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=4096
EOF
sudo chmod 600 .env          # 关键：锁住密钥文件权限

# --- 数据库密码 + 启动 ---
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" | sudo tee -a .env
sudo docker compose up -d --build
sudo docker compose logs -f app
```

验证：

```bash
curl -s localhost:3001/api/health
# {"status":"ok","agents":["expert","teacher","peer"]}
sudo docker compose exec app node -e "console.log(process.env.DATABASE_URL?'PG 模式':'JSON 模式')"
```

对外提供 HTTPS：接 `deploy/nginx.conf`（compose 已把端口绑在 `127.0.0.1:3001`，
不直接暴露）：

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/doo-multi-agent.conf
sudo sed -i 's/doo\.example\.com/你的域名/g' /etc/nginx/conf.d/doo-multi-agent.conf
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

---

## 3. 路径 B：Railway

1. Railway → **New Project → Deploy from GitHub repo** → 选 `iszhanglimm/doo-multi-agent`
2. **Root Directory 必须设成 `doo-multi-agent`**（仓库里还有一层同名目录，容易踩）
3. 在 **Variables** 里加 §1 的环境变量（`LLM_API_KEY` 等）
4. **New → Database → PostgreSQL**，Railway 自动注入 `DATABASE_URL` ✅
5. **Volumes**：`/app/web/data`（仅 JSON 模式需要；接了 PG 就不必）
6. Deploy，等健康检查 `/api/health` 通过

`railway.json` 已配好，无需改动：

```json
{ "buildCommand": "npm run build",
  "startCommand": "cd web && npx tsx server/index.ts",
  "healthcheckPath": "/api/health" }
```

> ⚠️ Railway 免费计划每月 $1 额度。本项目是**常驻 Node 服务 + 常驻 Postgres**，
> 按官方费率（$20/vCPU·月、$10/GB RAM·月）估算约 **$2–5/月**，
> 免费额度会在几天内耗尽 → 实际等于 Hobby 的 **$5/月**。
> 建议在 Billing 里设 **hard usage limit**（最低 $10）避免意外账单。

---

## 4. 路径 C：裸机 Linux（systemd + Nginx）

```bash
sudo apt install -y nginx git postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd -r -s /sbin/nologin -d /opt/doo-multi-agent doo
sudo mkdir -p /opt/doo-multi-agent && sudo chown -R doo:doo /opt/doo-multi-agent
sudo -u doo git clone https://github.com/iszhanglimm/doo-multi-agent.git /opt/doo-multi-agent
cd /opt/doo-multi-agent

# 依赖 + 前端构建（Linux 上 node_modules/.bin 是正常 shim，不会踩 Windows 那个坑）
sudo -u doo npm ci --no-audit --no-fund
sudo -u doo bash -c 'cd web && npm ci --no-audit --no-fund && npm run build'

# .env（同上，注意 chmod 600）
sudo -u doo install -m 600 /dev/null .env
sudo -u doo nano .env

# 服务
sudo cp deploy/doo-multi-agent.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now doo-multi-agent
journalctl -u doo-multi-agent -f
```

Nginx 同上（§2 末段）。

---

## 5. 数据与账号：什么时候必须上 PostgreSQL

`src/index.ts:63`：

```ts
if (process.env.DATABASE_URL) {
  const pg = new PostgresStorage(process.env.DATABASE_URL);
  this.portraitStorage = pg;
  pg.init().catch(err => console.error('PostgreSQL init failed:', err));
  console.log('📦 使用 PostgreSQL 持久化存储');
} else {
  this.portraitStorage = new PortraitStorage(config.storage);  // JSON 文件
  console.log('📦 使用 JSON 文件存储');
}
```

| | JSON 模式（默认） | PostgreSQL 模式（设了 `DATABASE_URL`） |
|---|---|---|
| 账号 | **硬编码**：`teacher1`/`123456`、`admin`/`admin` | 真实账号表，`bcrypt` 校验 |
| 注册 `/api/auth/register` | 直接返回 **503**「当前为本地模式」 | 可用 |
| 管理后台改密码 / 删用户 | 503 | 可用 |
| 持久化 | 容器重启即丢（除非挂卷） | 落库，重启不丢 |
| 多人并发 | 文件级覆盖风险 | 安全（`ON CONFLICT DO UPDATE`） |

**结论**：只要"供其他人访问使用"包含**多个老师各自登录**，就必须接 PostgreSQL。
`PostgresStorage.init()` 会自动 `CREATE TABLE IF NOT EXISTS`
（`portraits`、`users`），**无需手工建表**。

> ⚠️ `pg.init()` 的失败被 `.catch()` 吞掉且**只执行一次、不会重试**。
> 数据库没就绪会导致建表静默失败且不自愈 → `docker-compose.yml` 里已用
> `depends_on: service_healthy` 规避；裸机部署请确保 Postgres 先于服务启动
> （service 单元里预留了 `Requires=postgresql.service`）。

---

## 6. 已知限制（部署前务必知情）

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | `web/.edgetts`、`web/.stt` 是 **macOS 的 python venv** | `/api/tts`、`/api/stt` 返回 **500**，语音朗读/录音不可用 | 在服务器重建 venv 并用 `EDGE_TTS_PYTHON`/`STT_PYTHON` 指过去。TTS 用 `pip install edge-tts` 很轻；STT 是 whisper，要拉模型（数百 MB） |
| 2 | `/api/*` 已内置访问控制中间件，但**默认关闭** | 未设 `ACCESS_CODE` 时所有接口完全公开，拿到 URL 的任何人都能调用评估接口、**直接消耗你的 LLM 额度** | **公网部署必须设置 `ACCESS_CODE`**（见 §1）。前端登录页只是 localStorage 状态，不构成防护 |
| 3 | 幼儿**姓名 / 班级 / 叙事文本**入库 | 属个人信息，儿童信息更属敏感个人信息 | 见 §7 |
| 4 | 根依赖里的 `sqlite3` | 全仓库搜不到 `from 'sqlite3'` / `require('sqlite3')`；只在 `src/core/types.ts:187`、`src/portrait/PortraitStorage.ts:8` 的 `type: 'json' \| 'sqlite'` 里保留了选项，**且无实现**。但 `npm ci` 仍会走 `prebuild-install` 从 GitHub Releases 拉二进制 | 构建环境访问不了 GitHub 时，从 `package.json` 删掉 `sqlite3` + `@types/sqlite3`（删前建议自行再确认一次） |
| 5 | 前端 `web/dist` 未纳入版本控制 | 必须**先构建前端**再启动，否则 `/` 无页面（接口仍正常） | Dockerfile 与各路径步骤里都已包含构建 |
| 6 | 内存占用 | Node + 三智能体 + Postgres，建议 ≥1GB 内存 | 低于 512MB 的机器可能 OOM |

---

## 7. 合规提醒（境内真实使用必读）

- 若面向**中国境内**的幼儿园/教师提供服务：用域名对外发布需完成 **ICP 备案**；
  未备案的 80/443 会被阻断（用非标准端口+IP 可临时绕过，但不适合正式使用）。
- 系统存储的是**不满十四周岁儿童的个人信息**，按《个人信息保护法》属**敏感个人信息**，
  需取得**监护人单独同意**，并做最小必要采集、加密传输、访问审计、限期留存。
- 因此建议：**服务器与数据落在境内**、强制 HTTPS、限制访问范围
  （最好只对园内网段或指定账号开放），避免使用境外 PaaS 托管儿童数据造成出境风险。

---

## 8. 上线检查清单

```
[ ] .env 已在服务器创建且权限为 600，密钥未进入 git / 镜像
[ ] DATABASE_URL 已设置（需要多账号登录时）
[ ] 前端已构建：web/dist/index.html 存在
[ ] /api/health 返回 {"status":"ok",...}
[ ] 日志显示 "📦 使用 PostgreSQL 持久化存储"（而不是 JSON 文件存储）
[ ] 用 teacher1/123456 登录成功，并已修改默认密码
[ ] 完成一次真实评估，/api/portraits 数量 +1
[ ] 重启容器/服务后画像仍在（验证持久化真的生效）
[ ] Nginx 已配 HTTPS，HTTP 301 跳转正常
[ ] 已设置 ACCESS_CODE（除 /api/health 外全部需 Basic 认证）
[ ] 已确认 /api/health 仍免鉴权（200，否则平台健康检查会失败）
[ ] 已验证限流：连打 /api/ 超过 RATE_LIMIT_PER_MIN 会返回 429
[ ] 语音功能：确认不可用或已重建 venv
```

---

## 附：扣子编程（Coze）能否部署？

**结论：能，但不能像 Docker 那样"扔镜像"，需要按它的范式适配；且有三个硬伤。**

依据：官方文档 `docs.coze.cn/guides_deploy_vibe_web`、`guides_deploy_vibe_web`→配额与限制、
`coze_pro_service_hosting_fee`（2026-09-16 查阅）。

### 它提供什么

- 「网页应用」可一键部署为公网 HTTPS 站点，默认域名 `*.coze.site`（仅网页应用支持自定义域名）
- 默认算力 **1C2G × 2 实例 × 100 并发**；**无流量时可缩容至 0 实例**
- 有「生产环境变量」可放 `LLM_API_KEY`；有内置托管数据库（开发/生产环境隔离、表结构同步）
- 终端可执行 `npm install`（官方文档原文示例）→ **Node 环境存在**

### 与本项目的契合度

| 项 | 扣子编程 | 本项目 | 结论 |
|---|---|---|---|
| 端口 | 平台注入 `$PORT` | `Number(process.env.PORT) \|\| 3001` | ✅ |
| 监听地址 | 须 `0.0.0.0` | `app.listen(port)` 默认全接口 | ✅ |
| 环境变量 | 生产环境变量 | `LLM_API_KEY` 等 | ✅ |
| 数据库 | 内置托管 | 设 `DATABASE_URL` 即切 Postgres | ✅ |
| **构建指令 / 端口** | **不支持修改，只能查看** | — | ⚠️ 必须逆向适配 |
| 单文件上传 | 部署后 ≤ **16MB** | `/api/stt` 限制 **30MB** | ⚠️ 语音上传会失败 |
| 无数据交互连接 | **90 秒**断开 | 单次评估实测 ~4s | ✅ |
| 可见性 | **仅支持公开部署** | `/api/*` **零鉴权** | ⚠️⚠️ |

### 费用（按实际访问时长计费）

`算力单价 × CU × 访问时长(秒) + 流量单价 × 流量(GiB)`

- 算力：**0.00018 元/CU/秒**（1 CU = 1核2G），即约 **0.65 元/小时**
- 流量：**0.08 元/GiB**
- **原文关键点**：「当用户打开或调用你已部署的项目时，才会产生费用。**如果项目已部署，但没有人访问，则不会产生费用**」

本项目按 1 CU 估算：

| 每日实际访问 | 月算力费 |
|---|---|
| 30 分钟 | ≈ 10 元 |
| 1 小时 | ≈ 19 元 |
| 2 小时 | ≈ 39 元 |

> ⚠️ 「访问时长」的边界（是否含实例保活期）官方未明确定义，**建议先建个小项目实测一天再看账单**，
> 不要直接按上表做预算。

### 套餐限制

- **个人免费版可以部署**，但：强制带 Coze 品牌 Logo ➖、**不能修改部署域名前缀**、
  **不能绑定自定义域名**（需个人高阶版及以上）
- 绑定自定义域名需完成**备案**（1~20 个工作日）
- 运行日志保留 7 天，Trace 保留 3 天

### 三个硬伤

1. **仅支持公开部署** + 本项目接口零服务端鉴权 → 任何拿到链接的人都能刷，直接消耗扣子积分/你的额度
2. **幼儿个人信息放公开站点**的合规风险，且平台会对网页内容做审核
3. **适配成本**：它是以「AI 生成代码」为主的平台，把一个现成的 8 万行项目塞进去，
   构建/启动约定不可改，需按平台范式改造——比用 Docker 部署麻烦

### 一个值得单独评估的用法

扣子内置大模型集成（Doubao / GLM / Kimi / DeepSeek），**无需自配 API Key**。
若能让 `LLM_BASE_URL` 指向扣子的模型服务，就能省掉 DeepSeek 的 key 与费用（改用扣子积分）。
但扣子 API 是 `/v3/chat` 形态、**并非 OpenAI 兼容**，需要改 `src/nlp/LLMClient.ts` 的调用方式。

### 该选谁

| 目标 | 建议 |
|---|---|
| 快速给同事演示、成本趋近于 0 | 扣子编程免费版（接受带 Logo + 随机域名） |
| 给幼儿园长期正式使用 | **国内轻量服务器 + 本仓库的 `docker-compose.yml`**（可备案、可控、数据在境内） |

