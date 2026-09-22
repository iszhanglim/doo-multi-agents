# 部署到扣子编程（Coze）操作手册

> 依据官方文档（2026-09 查阅）：`guides_import_from_github`、`guides_deploy_vibe_web`、
> `guides/integrate_database`、`guides/vibe_coding_limit`、`coze_pro_service_hosting_fee`。
>
> ⚠️ **部署动作必须在你自己的扣子账号里点击** —— 扣子编程是浏览器内的云端开发环境，
> 没有可供外部调用的部署 CLI/API，无法由第三方代操作。

---

## 0. 先说结论：可行，且代码无需改动

| 检查项 | 官方要求 | 本项目现状 | |
|---|---|---|---|
| 导入现有项目 | 支持 GitHub 导入 / 本地上传 zip | 仓库已在 GitHub | ✅ |
| 仓库体积 | GitHub 导入 ≤500MB | **排除 node_modules 后源码仅 2.3MB** | ✅ |
| 沙箱容量 | 网页应用 3GB | 依赖装完约 263MB | ✅ |
| 端口 | 用平台注入的 `$PORT` | 代码已实现 `Number(process.env.PORT) \|\| 3001` | ✅ |
| 监听地址 | 须 `0.0.0.0` | `app.listen(port)` 默认全接口 | ✅ |
| 数据库 | **PostgreSQL 引擎** | `PostgresStorage` 用的正是 PG，类型全兼容 | ✅ |
| 数据库费用 | 官方原文「目前**免收**存储、数据库、向量模型的内置集成费用」 | — | ✅ |
| 运行时 | 未给出明确清单，但文档示例含 `npm install` | Node 项目 | ⚠️ 待实测 |
| 单文件上传 | 部署后 ≤ **16MB** | `/api/stt` 已收紧为 `limit: '16mb'`（原 30MB） | ✅ |
| 可见性 | **仅支持公开部署** | `ACCESS_CODE` 站点口令 + 登录令牌/角色（管理接口）+ 两级限流 | ⚠️ 见 §7 |

**代码零改动**：`package.json` 的 `build` 脚本（`tsc && cd web && npm install && npm run build`）
本身就包含了 web 目录的依赖安装与前端构建，`start` 脚本也已用 `$PORT`。
三处实测均通过：`tsc` exit 0 / `tsc -b` exit 0 / `vite build` exit 0。

---

## 1. 前置准备

- [ ] 扣子账号（免费版即可部署，但会**强制带 Coze 品牌 Logo**、不能改域名前缀、不能绑自定义域名）
- [ ] 仓库已推送到 GitHub：`iszhanglimm/doo-multi-agent`
- [ ] 准备好 DeepSeek API Key
- [ ] 本地确认 `AGENTS.md` 已随仓库提交 —— 它是给扣子 AI 读的部署契约，**很关键**

---

## 2. 导入项目（两条路，选一）

### 路径 A：GitHub 导入（推荐）

1. 登录 <https://code.coze.cn>
2. 左侧导航「**集成管理 → Git 服务 → GitHub → 配置**」，按提示完成 GitHub 授权
   （免费版只有一个默认个人空间，无需切换工作空间）
3. 左侧导航「**导入 → GitHub 导入**」，选择 `iszhanglimm/doo-multi-agent`
4. 扣子自动克隆代码、理解源码、补齐 `AGENTS.md`，然后**自动构建**
5. 构建完成后，在右侧打开新标签页点「预览」调试

### 路径 B：本地上传（GitHub 授权走不通时）

直接用随本手册生成的压缩包：`doo-multi-agent-coze.zip`
（已排除 `node_modules` / `.git` / `.edgetts` / `.stt` / `dist`，约 2–3MB）

1. 左侧导航「**导入 → 本地上传**」
2. 选择该 zip → 确定
   - 要求：`.zip` / `.tar` / `.tar.gz`，**解压后必须是单个文件夹**（本包满足）
   - 限制：文件夹内单文件 ≤500MB

> ⚠️ 不要把自己的 `node_modules`（263MB）打进包里 —— 沙箱只有 3GB，
> 且平台会自己安装依赖。

---

## 3. 配置内置数据库（必做，否则重启丢数据）

### 3.1 开通数据库

在 AI 编程对话区直接说：

```
为项目接入数据库能力
```

或在右上角「➕ → 集成服务 → 数据库」手动开通。

### 3.2 在开发库里建表（**关键**）

生产库是在**首次部署时**按**开发库的表结构**自动创建的。
所以必须先在这里把两张表建好，否则线上 `DATABASE_URL` 生效后会报表不存在。

在「数据库 → SQL查询」里执行（与 `src/portrait/PostgresStorage.ts` 的 `init()` 完全一致）：

```sql
CREATE TABLE IF NOT EXISTS portraits (
  child_id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  class_id VARCHAR(128) NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portraits_class ON portraits(class_id);

CREATE TABLE IF NOT EXISTS users (
  username VARCHAR(64) PRIMARY KEY,
  password_hash VARCHAR(128) NOT NULL,
  name VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'teacher',
  class_id VARCHAR(64),
  avatar VARCHAR(16) DEFAULT '👩‍🏫',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.3 取连接串

「数据库 → **设置**」页可查看存储容量与**环境变量**信息 → 复制 PostgreSQL 连接串。

---

## 4. 部署配置

在 AI 编程界面右上角点「**部署**」：

| 配置项 | 怎么填 |
|---|---|
| 部署版本 | 选当前开发版本 |
| 配置部署域名 | 默认 `*.coze.site`，可改前缀（免费版**不能**改） |
| 可见性 | **仅支持公开部署**，无其他选项 |
| 服务器资源 | 默认 **1C2G × 2 实例 × 100 并发**，够用（免费版不可调） |
| 数据库 | 首次部署建议选**「关闭（仅同步表结构）」**，不要同步测试数据 |
| **生产环境变量** | 见下表，逐个新建 |
| 构建指令 / 端口 | **不支持修改，只能查看** —— 无需操作 |

### 生产环境变量（逐个新建）

```
LLM_PROVIDER=openai
LLM_API_KEY=<你的 DeepSeek Key>
LLM_BASE_URL=https://api.deepseek.com/chat/completions
LLM_MODEL=deepseek-flash
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=8192
LLM_EXTRA_BODY={"thinking":{"type":"disabled"}}
LLM_TIMEOUT_MS=30000
DATABASE_URL=<从「数据库 → 设置」复制的连接串>
ACCESS_CODE=<自己定一个访问口令，公网部署强烈建议必填>
AUTH_SECRET=<建议单独设一个随机串，用于登录令牌签名；不设则复用 ACCESS_CODE>
RATE_LIMIT_PER_MIN=120
RATE_LIMIT_GLOBAL_PER_MIN=1200
```

> **`ACCESS_CODE` 是公网部署的关键防护**。扣子仅支持公开部署，不设口令就等于把
> `/api/assess` 敞开给任何人刷 LLM 额度。设置后：
> - 除 `/api/health` 外所有请求需要 HTTP Basic 认证，**用户名任意，密码填 `ACCESS_CODE`**
> - 浏览器首次打开会弹原生登录框；认证后凭证被缓存，`fetch('/api/...')` 自动携带
> - 同时启用两级限流：按 IP（默认 120 次/分钟）+ **全站兜底**（默认 1200 次/分钟）。
>   IP 取自 `X-Forwarded-For`、可被伪造，全站上限才是真正护住 LLM 额度的那道闸
> - `/api/health` 刻意保持公开 —— 扣子的健康检查依赖它，加了鉴权会导致**部署失败**

> **站点口令 ≠ 身份**。`ACCESS_CODE` 是全员同一个的共享口令，无法区分是谁，
> 因此管理类接口（用户列表 / 改密 / 删除用户 / 重置密码）改为依赖**登录令牌 + 角色**：
> 登录成功后服务端签发 HMAC 令牌，前端存 `localStorage` 并以 `X-Auth-Token` 头回传，
> 管理员接口再校验 `role === 'admin'`。
> 若不单独设 `AUTH_SECRET`，请确保 `ACCESS_CODE` 足够随机（它会被复用为签名密钥）。

> `LLM_BASE_URL` 必须保留 `/chat/completions` 后缀 ——
> 它被当作**完整 endpoint** 直接 POST（`src/nlp/LLMClient.ts` 的 `callOpenAI` / `callCustom`），
> 不是 SDK 的 baseURL；写成 `https://api.deepseek.com/v1` 这种 baseURL 形式会 404。

> **`LLM_PROVIDER` 请用 `openai`（不要用 `custom`）**：两者都把 `LLM_BASE_URL` 当完整
> endpoint 直接 POST，但 `LLM_EXTRA_BODY` 的注入点在 OpenAI 兼容分支；用 `custom`
> 会导致思考模式关不掉、思考耗尽 `max_tokens` 使 `content` 为空，
> 评估**静默降级**为规则引擎（页面不报错，只是结果异常）。

填完点「**开始部署**」，看部署日志（构建 → 打包 → 部署），约几分钟。

---

## 5. 验收

```bash
curl -s https://<你的域名>/api/health
# {"status":"ok","agents":["expert","teacher","peer"]}

curl -s https://<你的域名>/api/stats
# {"success":true,"stats":{...}}
```

然后在浏览器打开根路径，用 `teacher1 / 123456` 登录 → 跑一次评估。

**启动日志必须出现 `📦 使用 PostgreSQL 持久化存储`。**
如果显示「JSON 文件存储」，说明 `DATABASE_URL` 没生效，去「部署 → 日志」核对。

---

## 6. 常见报错对照

| 现象 | 根因 | 处理 |
|---|---|---|
| 健康检查失败 / 探活超时 | 端口写死 | 确认代码仍是 `Number(process.env.PORT) \|\| 3001`，别改成 3001 |
| 探活失败且用 curl 能通 | 监听在 `127.0.0.1` | 保持 `app.listen(port)` 不带 host 参数 |
| 根路径 404 | `web/dist` 不存在 | 确认 `npm run build` 成功且前端产物在 `web/dist` |
| 数据库连不上 | 未开通内置库，或生产环境变量没配 | 见 §3 |
| 表不存在 | 开发库没建表就部署了 | 补建表后重新部署（后续部署**只同步表结构，不同步数据**） |
| 重启后数据没了 | `DATABASE_URL` 没生效，走了 JSON 模式 | 检查部署日志那行提示 |
| 语音朗读/录音报错 | 预期行为 | 见 `AGENTS.md` §7 |
| 长连接中断 | 无数据交互 **90 秒**断开 | 单次评估实测约 4 秒，正常使用不受影响 |

---

## 7. 三个必须知道的风险

1. **只支持公开部署** —— 已通过三层防护兜住（见 §4）
   服务端中间件位于 `web/server/index.ts` 头部：
   1. `ACCESS_CODE` 站点级共享口令（HTTP Basic），把整个站点挡在门外；
   2. 按 IP（120/分钟）+ **全站兜底**（1200/分钟）两级限流，保护 LLM 额度不被刷；
   3. 管理类接口（用户列表 / 改密 / 删除 / 重置密码）额外要求**登录令牌 + `admin` 角色**
      —— 共享口令无法区分身份，不能用来做授权。
   **上线前务必在「生产环境变量」里填上 `ACCESS_CODE`**，否则链接外泄即可被刷额度。
   免费版还强制带 Coze Logo，链接更容易被外部扫到。

> 相关：前端那个 `teacher1/123456` 登录页自身不是安全边界，但现在它的登录结果
> 会换取服务端签发的令牌，**管理接口的授权已由服务端令牌承担**，不再依赖前端状态。

2. **幼儿个人信息（姓名 / 班级 / 叙事文本）会落到扣子的托管数据库**
   属敏感个人信息，公开站点 + 第三方托管需评估合规。
   若要给真实幼儿园长期使用，建议改用境内自建服务器（见 `DEPLOY.md`）。

3. **平台会审核网页内容**，且运行日志只保留 7 天、Trace 只保留 3 天。

---

## 8. 成本

`算力单价 × CU × 访问时长(秒) + 流量单价 × GiB`

- 算力 **0.00018 元/CU/秒**（1 CU = 1核2G）≈ **0.65 元/小时**
- 流量 **0.08 元/GiB**
- 官方原文：*"当用户打开或调用你已部署的项目时，才会产生费用。
  **如果项目已部署，但没有人访问，则不会产生费用**。"*，每天结算一次

| 每天实际访问 | 月算力费 |
|---|---|
| 30 分钟 | ≈ 10 元 |
| 1 小时 | ≈ 19 元 |
| 2 小时 | ≈ 39 元 |

> ⚠️「访问时长」的边界（是否含实例保活期）官方未定义，
> **建议部署后先观察一天的实际扣费再决定是否长期用**，不要照上表做预算。
> 开发阶段的对话（扣子编程任务）也会消耗积分。
