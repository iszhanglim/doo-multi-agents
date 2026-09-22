# AGENTS.md — 部署与运行契约

> 本文件是给 AI 编程助手（含扣子编程）的项目说明书。
> **导入项目后请先完整阅读本文件，再执行任何构建或部署动作。**
> 违反下面「硬性约束」的部分会导致线上服务健康检查失败。

## 1. 项目是什么

DOO 多智能体系统 —— 幼儿园大班（5–6 岁）幼儿叙事能力评估工具。
三个 AI 角色（D博士 / 小欧老师 / 多多）协作评估幼儿叙事并生成画像与报告。

- 后端：TypeScript + Express + `tsx`（直接运行 TS 源码，**不依赖编译产物 `dist/`**）
- 前端：React 19 + Vite 8，构建产物在 `web/dist`，**由后端静态托管**
- 存储：PostgreSQL（推荐）或本地 JSON 文件
- 部署形态：**单端口 HTTP 服务**（前端静态资源 + `/api/*` 接口同源）

## 2. 关键路径

```
package.json            ← 根依赖，含 tsx / pg / openai / bcrypt / dotenv / uuid
tsconfig.json
src/                    ← 后端核心（智能体、DOO 模型、NLP、画像、场景）
src/index.ts            ← DOOMultiAgentSystem 入口类；第 63 行按 DATABASE_URL 切换存储
src/config/default.ts   ← 读环境变量装配配置
src/nlp/LLMClient.ts    ← LLM 调用；callCustom 把 LLM_BASE_URL 当完整 endpoint POST；callCoze 走平台托管 SDK
src/portrait/PostgresStorage.ts  ← PG 存储；init() 内建 CREATE TABLE IF NOT EXISTS
web/package.json        ← 前端 + 服务端依赖，含 tsx / express / vite
web/server/index.ts     ← HTTP 服务入口（所有 /api/* 路由都在这里）
web/dist/               ← 前端构建产物，必须存在，否则访问 / 会 404
web/data/               ← JSON 模式下的画像数据目录（相对 cwd）
```

## 3. 构建与启动（保持 package.json 脚本原样，不要改写）

```bash
npm install          # 根依赖
npm run build        # = tsc && cd web && npm install && npm run build
                     #   注意：这一步已包含 web 目录的依赖安装与前端构建
npm start            # = cd web && npx tsx server/index.ts
```

- `npm run build` 里的 `tsc` 必须通过（当前源码无类型错误，已实测 exit 0）
- `npm start` **必须**在 `web/` 作为工作目录下执行：
  `DATA_PATH=./data` 是相对 cwd 解析的
- 前端产物 `web/dist/index.html` 必须存在；后端在 `web/server/index.ts` 末尾
  用 `express.static` 托管它，否则根路径无页面（接口仍可用）

## 3.5 扣子编程平台接入（2026-09-16 初始化）

平台接入时做了以下工程对齐，**不影响上面 npm 契约的语义**（package.json 里的
`build` / `start` 脚本保留未动，仍与 README/railway/Dockerfile 一致）：

- **包管理器从 npm 迁移到 pnpm**：两处 `package-lock.json` 已移除，改用
  `pnpm-lock.yaml`（根 + `web/`）。平台强制 Node 用 pnpm。
- **`.coze` 体系（多层）**：
  - 根 `/workspace/projects/.coze`：`project_type="web"`、`sub_id=ad8babbd`、
    `requires=["nodejs-24"]`、`[subprojects].path=["doo-multi-agent"]`，含 `[dev]` 与 `[deploy]`。
  - 子项目 `doo-multi-agent/.coze`：`sub_id/name/project_type` 已补齐。
- **预览端口**：`.preview` 声明 `expose_port=5000`（已加 gitignore）。
- **预览 / 部署脚本**：`scripts/build.sh`（pnpm 安装依赖 + 构建前端 → `web/dist`）、
  `scripts/run.sh`（读 `.preview` 端口 fallback 5000，`cd web && pnpm exec tsx server/index.ts`，
  绑定 0.0.0.0）。run 脚本从 `.preview` 读端口，未 hardcode。
- `.gitignore` 已加 `.preview`。

## 4. ⚠️ 硬性约束（违反会导致健康检查失败）

1. **端口必须用平台注入的环境变量**，不要写死：
   代码已实现 `const port = Number(process.env.PORT) || 3001`，**不要改成固定 3001**。
   扣子编程常见报错「健康检查失败」「探活超时」的根因就是端口写死。
2. **必须监听 `0.0.0.0`**，不能只绑 `127.0.0.1`。
   当前实现是 `app.listen(port)`（无 host 参数），Node 默认绑定全接口 —— **保持这样**。
3. **`PORT` / 构建指令 / 启动指令由平台决定，不要试图反向覆盖**。
4. 不要执行构建产物之外的重新打包；不要改 `web/dist` 的输出目录。
5. **不要把 `node_modules` 提交进版本控制**。
6. **不要给 `/api/health` 加鉴权**，也不要移动访问控制中间件的位置 ——
   它必须位于 `app.use(cors())` 之后、`app.use(bodyParser.json())` 之前。

## 5. 数据持久化：必须用内置 PostgreSQL

生产环境**容器重启会清空本地目录**，JSON 文件模式会丢数据，因此：

1. 先为项目开通内置数据库能力（「集成服务 → 数据库」）
2. 在开发数据库里执行建表 SQL（见下），因为**生产库是在首次部署时按开发库表结构自动创建的**
3. 在「数据库 → 设置」页复制连接凭据，作为**生产环境变量 `DATABASE_URL`** 写入部署配置

代码逻辑（`src/index.ts:63`）：只有 `process.env.DATABASE_URL` 存在时才启用 PostgreSQL；
否则回落到 JSON 文件存储（多人使用会互相覆盖，且重启丢数据）。

### 5.1 已在扣子平台接入内置 PostgreSQL（2026-09-16 实测通过）

- 平台通过 workload identity 注入连接变量为 **`PGDATABASE_URL`**（完整 `postgresql://...?sslmode=require` 连接串），
  另含 `PGHOST / PGUSER / PGPASSWORD / PGDATABASE / PGPORT` 组件。
- 项目 `src/index.ts` 读的是 `DATABASE_URL`，二者不一致。已通过 `scripts/run.sh` 在启动前做映射：
  `DATABASE_URL` 未设置时 → 优先用 `PGDATABASE_URL` → 否则用 workload identity 拉取 `PGDATABASE_URL` 填充。
  **不改 `PostgresStorage.ts` / `src/index.ts` 业务逻辑。**
- 已按下文 SQL 在平台托管的 PostgreSQL（库 `postgres`）中建好 `portraits` 与 `users` 两张表（`CREATE TABLE IF NOT EXISTS`）。
- 已验证：`/api/assess` 写入的画像真实落库到 `portraits`；`/api/auth/login` 返回 `classId` 证明走 `users` 表（JSON 模式不返回该字段）。
- **班级过滤（2026-09-22 起）**：`/api/portraits` 与 `/api/stats` 支持 `?classId=` 查询参数过滤；
  前端 `usePortraits` / `useStats` 自动取登录老师（`AuthContext.user.classId`）的班级带参请求——
  老师只看到本班学生，admin（无 classId）与未登录仍看全部。
- 本地无数据库注入时，`DATABASE_URL` 为空 → 自动回落 JSON 文件存储，不影响预览启动。

> 表结构与 `src/portrait/PostgresStorage.ts` 的 `init()` 完全一致，可直接执行：

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

## 6. 环境变量清单

| 变量 | 必填 | 值 |
|---|---|---|
| `PORT` | ⬜ 平台注入 | **不要写死**，代码已读取 |
| `LLM_PROVIDER` | ⬜ | 默认 `coze`（平台托管，免 key）。**当前沙箱 `.env` 配置为 `openai`**（OpenAI 兼容协议走 `callOpenAI`） |
| `LLM_MODEL` | ⬜ | coze 托管默认 `doubao-seed-2-0-pro-260215`；当前 `.env` 为 `deepseek-flash` |
| `LLM_API_KEY` | 仅 openai/custom 必填 | DeepSeek 密钥（沙箱放 gitignored 的 `.env`；生产配到平台环境变量，禁止硬编码/入库） |
| `LLM_BASE_URL` | 仅 openai/custom 必填 | 完整 endpoint：`https://api.deepseek.com/chat/completions`（`callOpenAI`/`callCustom` 都把它当完整 URL 直接 fetch） |
| `LLM_EXTRA_BODY` | ⬜ | JSON 对象，透传到请求体的额外字段（`LLMConfig.extraBody`）。**DeepSeek 思考模型必配 `{"thinking":{"type":"disabled"}}`**，否则思考耗尽 max_tokens 导致 content 为空。保留键 `model` / `messages` 会被忽略（防静默改写请求语义）。**当前对 `openai` / `custom` / `anthropic` 生效，`coze` 路径（SDK 入参受限）不生效** |
| `LLM_TIMEOUT_MS` | ⬜ | 单次 LLM 调用超时毫秒，默认 `30000`。平台无数据交互约 90s 断连，配合 2 次尝试建议不超过 30s |
| `LLM_TEMPERATURE` | ⬜ | `0.7`。`0` 是合法值（可求确定性输出），实现已按「未设置才取默认」处理 |
| `LLM_MAX_TOKENS` | ⬜ | 默认 `2000`——**对思考型模型远远不够**，当前 `.env` 为 `8192`。注意 `coze` 路径不传该参数 |
| `DATABASE_URL` | ✅ 生产必填 | 从「数据库 → 设置」复制的连接串 |
| `ACCESS_CODE` | ⚠️ **公网必填** | 站点级**共享**口令。设置后除 `/api/health` 外全部请求需 HTTP Basic 认证（用户名任意，密码填该值）。**不设置则站点完全公开**。注意它是全员同一个、**无法区分身份**，不承担授权职责 |
| `ACCESS_REALM` | ⬜ | Basic 认证提示语，默认 `DOO Multi-Agent` |
| `AUTH_SECRET` | ⬜ | 登录令牌（HMAC）签名密钥，默认复用 `ACCESS_CODE`；生产推荐单独设随机值 |
| `AUTH_TOKEN_TTL_HOURS` | ⬜ | 登录令牌有效期（小时），默认 `12` |
| `RATE_LIMIT_PER_MIN` | ⬜ | 每 IP 每分钟 `/api/*` 请求上限，默认 `120`；设 `0` 关闭限流 |
| `RATE_LIMIT_GLOBAL_PER_MIN` | ⬜ | 全站每分钟上限（兜底），默认 `RATE_LIMIT_PER_MIN×10`。`X-Forwarded-For` 可伪造，这道闸才是保护 LLM 额度的关键 |
| `TTS_CACHE_TTL_HOURS` | ⬜ | TTS 落盘缓存有效期（小时），默认 `24`；沙箱磁盘 3GB，缓存需可回收 |

**LLM 接入说明（2026-09 新增）**：默认 provider 为 `coze`——通过 `coze-coding-dev-sdk` 的托管 LLM（`callCoze`），凭据平台自动注入，无需任何 key；`useLLM` 判定（`src/index.ts`）对 `coze` 恒为 true。LLM 调用失败会自动回退规则引擎（`AssessmentEngine.assess` 的 catch 分支），服务不中断。当前平台托管 LLM 账户「资源点不足」（需升级付费套餐/增购积分），故推理暂走规则兜底；充值后无需改代码立即生效。

## 7. 已知不可用（属预期，不要尝试修复）

| 功能 | 状态 | 原因 |
|---|---|---|
| 单文件上传 > 16MB | ❌ 平台限制 | 扣子部署后单文件上传上限 16MB，而 `/api/stt` 允许 30MB |

### 7.1 语音能力（已接平台托管）

原「已知不可用」的 `/api/tts` 与 `/api/stt` 已于 2026-09 接入平台托管语音服务
（`coze-coding-dev-sdk` 的 `TTSClient` / `ASRClient`），不再依赖本地 venv：

- `/api/tts`：`TTSClient.synthesize` → 下载 mp3 → 落盘缓存（`/tmp/doo-tts`）后返回
  `audio/mpeg` 二进制（响应结构不变，前端零改动）。音色固定为
  `saturn_zh_male_tiancaitongzhuo_tob`（天才同桌男童声，贴合"多多"大班男孩设定；
  2026-09-22 由开朗少年声换为童声，**托管音色池中唯一男孩童声**——mars 系等其他
  童声 ID 实测均报 resource ID mismatch）；前端传 `rate:'+12%'`（语速稍快求活泼），
  `rate`（如 `+12%`）映射为 `speechRate`。
- **童声进一步幼态化（2026-09-22）**：前端 `VoiceOutput.tsx` 播放管线改用
  Web Audio `BufferSource.detune = +300 音分`（抬 3 个半音，变速不变调），
  把托管男童声再推幼一档；detune 不可用时回落原 `<audio>` 播放，服务端
  TTS 失败再降级 speechSynthesis（pitch 1.5）。**注意：托管引擎对 SSML
  `<prosody>`（任何属性，含 pitch/volume/rate）有慢放 bug**——5 秒文本会被
  拉长到 40~55 秒，`<speak>` 纯包装则正常；不要用 SSML prosody 调音调。
- **火山引擎 TTS provider（2026-09-22 接入，等凭证启用）**：`.env` 配置
  `VOLC_TTS_APPID` + `VOLC_TTS_TOKEN` 后自动优先走火山 v1 HTTP 非流式接口
  （`openspeech.bytedance.com/api/v1/tts`，Header `Bearer;{token}`，响应
  JSON `data` 为 base64 mp3，`code===3000` 为成功），音色默认剪映同款
  **奶气萌娃 2.0** `zh_male_naiqimengwa_uranus_bigtts`（`VOLC_TTS_VOICE` 可换），
  备选天才童声/开朗弟弟 2.0。失败自动回落托管 TTS。响应头 `X-TTS-Provider`
  告知前端 provider：`volc` 时前端不叠加 detune（原生音色已足够幼态），
  `coze` 时前端 detune +300。音色与托管池无关——托管 TTS 白名单里没有
  剪映音色，实测 mars 系全部报 resource ID mismatch。**「奶气萌娃」在托管池
  已穷尽实测不存在**（saturn_zh_male_naiqimengwa_tob / zh_male_naiqimengwa_
  saturn_bigtts 均报 mismatch，而 README 在列对照组 dayi/xueayi 全部成功），
  托管池完整白名单=README 的 13 个音色；男孩童声仅天才同桌（最萌）、开朗少年
  两个。
- `/api/stt`：保留魔数嗅探 `detectAudioExt`；托管 ASR 只支持 wav/mp3/ogg/m4a。
  **前端不再用 MediaRecorder**（2026-09-21 起）：`VoiceInput.tsx` 改用 Web Audio
  采集 PCM → 线性重采样 16kHz → 编码 16-bit WAV 直传，服务端对主路径零转码依赖
  ——**部署环境没有 ffmpeg 也能用**（线上曾因 `spawn ffmpeg ENOENT` 报 500）。
  服务端 webm→ffmpeg 转码分支保留作兼容兜底。响应仍为 `{ok, text, error}`。
- `web/server/stt_worker.py` 及 whisper worker 基建已随迁移删除。

## 8. 部署后验证清单

```bash
curl -s $PUBLIC_URL/api/health
# 期望: {"status":"ok","agents":["expert","teacher","peer"]}

curl -s $PUBLIC_URL/api/stats
# 期望: {"success":true,"stats":{...}}

curl -s -I $PUBLIC_URL/ | head -1
# 期望: HTTP/2 200（前端静态页）
```

启动日志应出现：
- `📦 使用 PostgreSQL 持久化存储`（**若是「JSON 文件存储」说明 `DATABASE_URL` 没生效**）
- `📁 前端静态文件已托管: .../web/dist`
- `🚀 DOO多智能体API服务运行在 http://localhost:<PORT>`

## 9. 安全与访问控制

服务端访问控制位于 `web/server/index.ts` 文件头部（有明确的起止注释标记），分三层：

**第 1 层 · 站点口令（`ACCESS_CODE`）**

- **未设**：所有接口完全公开（保持本地开发无感），启动时打印告警。
- **设了**：除 `/api/health` 外所有请求都需要 HTTP Basic 认证，用户名任意、密码填该值。
  浏览器首次访问收到 `401 + WWW-Authenticate` 弹出原生登录框；凭证按「同源 + realm」
  缓存，后续 `fetch('/api/...')` 自动携带。
- ⚠️ 这是**全员共享**口令，**无法区分身份**，因此只用于「是否放进站点」，不承担授权。

**第 2 层 · 登录令牌 + 角色（授权）**

- `POST /api/auth/login` 成功后签发 HMAC 签名令牌（载荷含 `username` / `role` / 过期时间），
  密钥取 `AUTH_SECRET`（未设置则复用 `ACCESS_CODE`），有效期 `AUTH_TOKEN_TTL_HOURS`（默认 12h）。
- 前端存 `localStorage`（键 `doo_token`），以**自定义头 `X-Auth-Token`** 回传
  —— 用自定义头而非 `Authorization`，是为了不与浏览器缓存的 Basic 凭证互斥。
- 管理类接口（`GET /api/auth/users`、`PATCH|DELETE /api/auth/user/:username`、
  `POST /api/auth/user/:username/password`）要求 `role === 'admin'`；
  `POST /api/auth/password` 要求令牌身份与目标账号一致（管理员可代改）。
- 令牌无状态、可跨实例校验，不依赖内存会话。

**第 3 层 · 两级限流**

- 按 IP 滑窗：`RATE_LIMIT_PER_MIN`（默认 120/分钟）。
- 全站滑窗：`RATE_LIMIT_GLOBAL_PER_MIN`（默认 `RATE_LIMIT_PER_MIN×10`）。
  取 IP 依赖 `X-Forwarded-For`，网关未强制重写时可被伪造，**全站上限才是护住 LLM 额度的闸**。
- 超额返回 `429` + `Retry-After`；`OPTIONS` 预检放行，不影响 CORS。

**`/api/health` 必须保持公开**：平台用它做探活，一旦加鉴权会导致部署失败。

**入参边界**（公开站点防滥用）：`/api/assess` 叙事 ≤2000 字；`/api/conversation/turn`
单条发言 ≤500 字；`/api/tts` 文本 ≤500 字；`/api/stt` 上传 ≤16MB（与平台单文件上限对齐）；
场景类型走白名单校验，非法值返回 400 而非 500。

> 前端登录页本身不是安全边界，但它的登录结果会换取服务端令牌，
> **授权已由服务端承担**，不再依赖前端 localStorage 状态。
>
> ⚠️ 引入令牌与两级限流后，原先「2026-09-16 已实测」的那组鉴权/限流结论
> **需要重新实测**（健康检查免鉴权 200 / 无凭证 401 / 错口令 401 / 正确口令 200 /
> 限流 429 / `OPTIONS` 非 401 / 未设 `ACCESS_CODE` 时全部放行），
> 并补测：无令牌访问 `/api/auth/users` 应 401、`teacher` 角色应 403、`admin` 应 200。
