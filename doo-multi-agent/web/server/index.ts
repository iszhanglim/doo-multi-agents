import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import { DOOMultiAgentSystem } from '../../src';
import { PostgresStorage } from '../../src/portrait/PostgresStorage';
import { NarrativeInput, ScenarioType } from '../../src/core/types';
import {
  createSession,
  getSession,
  addTurn,
  buildNarrativeInput,
  getChildTurnCount,
  shouldSuggestEnd,
  markAssessed,
  removeSession,
} from '../../src/conversation/ConversationSession';

const app = express();
const port = Number(process.env.PORT) || 3001;

// ===========================================================================
// 访问控制（公网部署防护）
// ---------------------------------------------------------------------------
// 仅在设置了 ACCESS_CODE 时启用鉴权；不设置则完全放行，保持本地开发无感。
//
//   ACCESS_CODE        共享访问口令。设置后，除 /api/health 外的所有请求都需要 HTTP Basic 认证。
//                      用户名任意，密码填 ACCESS_CODE。
//                      工作方式：浏览器首次访问页面会收到 401 + WWW-Authenticate，
//                      弹出原生登录框；认证通过后凭证被浏览器按「同源+realm」缓存，
//                      后续页面的 fetch('/api/...') 会自动带上，因此前端代码无需任何改动。
//   ACCESS_REALM       登录框提示语，可选，默认 "DOO Multi-Agent"。
//   RATE_LIMIT_PER_MIN 每个 IP 每分钟允许的 /api/* 请求数，默认 120；设为 0 关闭限流。
//
// /api/health 必须保持公开：平台（含扣子编程、Railway）用它做健康检查，
// 一旦加了鉴权会导致部署失败。
// ===========================================================================
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const ACCESS_REALM = process.env.ACCESS_REALM || 'DOO Multi-Agent';
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);

if (!ACCESS_CODE) {
  console.warn('⚠️  未设置 ACCESS_CODE —— 所有接口当前处于公开状态，公网部署前请务必设置');
}

/** 探活与前置检查必须放行 */
const PUBLIC_PATHS = new Set(['/api/health']);

// --- 简易滑动窗口限流（内存实现，单实例有效）---
const HIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  if (!RATE_LIMIT_PER_MIN || RATE_LIMIT_PER_MIN <= 0) return false;
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < HIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_PER_MIN) {
    hits.set(ip, arr); // 保留窗口内时间戳，便于后续重试
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 10_000) hits.clear(); // 防止 Map 无限增长
  return false;
}

// 反向代理后取真实客户端 IP；trust proxy=1 表示只信任紧邻的一跳（平台网关）
app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next(); // 放行 CORS 预检，预检请求不携带凭证
  if (PUBLIC_PATHS.has(req.path)) return next();

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!ACCESS_CODE) return next();

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      decoded = ''; // 非法 base64，按未认证处理
    }
    const sep = decoded.indexOf(':');
    const pass = sep >= 0 ? decoded.slice(sep + 1) : decoded; // 用户名任意，只校验口令
    if (pass && pass === ACCESS_CODE) return next();
  }

  res.setHeader('WWW-Authenticate', `Basic realm="${ACCESS_REALM}", charset="UTF-8"`);
  return res.status(401).json({ error: '需要访问口令' });
});
// ======================= 访问控制结束 ======================================

// 由姓名+班级生成稳定的幼儿ID，保证同一幼儿多次评估累积到同一画像
function stableChildId(childName: string, classId: string): string {
  const safeName = childName.trim().replace(/[\s/\\]+/g, '_');
  const safeClass = (classId || 'class_001').trim().replace(/[\s/\\]+/g, '_');
  return `child_${safeClass}_${safeName}`;
}

app.use(cors());
app.use(bodyParser.json());

const system = new DOOMultiAgentSystem();

// 初始化系统
system.initialize().then(async () => {
  console.log('✅ DOO多智能体系统服务已启动');
  await seedDefaultUsers();
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', agents: ['expert', 'teacher', 'peer'] });
});

// 评估叙事
app.post('/api/assess', async (req, res) => {
  try {
    const { childId, childName, classId, content, scenario } = req.body;

    if (!childName || !content) {
      return res.status(400).json({ error: '缺少必要参数: childName, content' });
    }

    const input: NarrativeInput = {
      childId: childId || stableChildId(childName, classId || 'class_001'),
      childName,
      classId: classId || 'class_001',
      content,
      scenario: scenario || 'smart_story_corner',
      timestamp: new Date(),
    };

    // 使用场景运行来评估并保存画像
    const result = await system.runScenario(scenario || 'smart_story_corner', input);

    // 生成D博士个体报告（依据《个体报告模板》）
    let reportText = '';
    if (result.assessment) {
      try {
        const report = system.expertAgent.generateIndividualReport(input, result.assessment);
        reportText = report.fullText;
      } catch (e) {
        console.error('生成个体报告失败:', e);
      }
    }

    res.json({
      success: true,
      assessment: result.assessment,
      portrait: result.portrait,
      childId: input.childId,
      interactions: result.interactions,
      reflections: result.reflections ?? [],
      report: reportText,
    });
  } catch (error) {
    console.error('评估错误:', error);
    res.status(500).json({ error: '评估失败', message: (error as Error).message });
  }
});

// 运行场景
app.post('/api/scenario/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { childId, childName, classId, content } = req.body;

    const input: NarrativeInput = {
      childId: childId || stableChildId(childName || '匿名', classId || 'class_001'),
      childName: childName || '匿名',
      classId: classId || 'class_001',
      content: content || '',
      scenario: type as ScenarioType,
      timestamp: new Date(),
    };

    const result = await system.runScenario(type as ScenarioType, input);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('场景运行错误:', error);
    res.status(500).json({ error: '场景运行失败', message: (error as Error).message });
  }
});

// 获取幼儿画像
app.get('/api/portrait/:childId', async (req, res) => {
  try {
    const { childId } = req.params;
    const portrait = await system.getPortrait(childId);

    if (!portrait) {
      return res.status(404).json({ error: '未找到该幼儿画像' });
    }

    res.json({ success: true, portrait });
  } catch (error) {
    res.status(500).json({ error: '获取画像失败', message: (error as Error).message });
  }
});

// 获取所有画像
app.get('/api/portraits', async (req, res) => {
  try {
    const portraits = await system.portraitStorage.loadAllPortraits();
    res.json({ success: true, portraits });
  } catch (error) {
    res.status(500).json({ error: '获取画像列表失败', message: (error as Error).message });
  }
});

// 生成雷达图
app.get('/api/radar/:childId', async (req, res) => {
  try {
    const { childId } = req.params;
    const radar = await system.generateRadarChart(childId);
    res.json({ success: true, radar });
  } catch (error) {
    res.status(500).json({ error: '生成雷达图失败', message: (error as Error).message });
  }
});

// 生成报告
app.get('/api/report/:childId', async (req, res) => {
  try {
    const { childId } = req.params;
    const report = await system.generatePortraitReport(childId);
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: '生成报告失败', message: (error as Error).message });
  }
});

// 删除幼儿画像
app.delete('/api/portrait/:childId', async (req, res) => {
  try {
    const { childId } = req.params;
    const deleted = await system.portraitStorage.deletePortrait(childId);

    if (deleted) {
      res.json({ success: true, message: '画像已删除' });
    } else {
      res.status(404).json({ error: '未找到该幼儿画像' });
    }
  } catch (error) {
    res.status(500).json({ error: '删除画像失败', message: (error as Error).message });
  }
});

// 获取统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const portraits = await system.portraitStorage.loadAllPortraits();

    // 幼儿总数
    const totalChildren = portraits.length;

    // 班级统计
    const classMap = new Map<string, number>();
    let totalScore = 0;

    for (const portrait of portraits) {
      const classId = portrait.classId;
      classMap.set(classId, (classMap.get(classId) || 0) + 1);

      const score = (portrait.currentRadar.diction + portrait.currentRadar.organization + portrait.currentRadar.opinion) / 3;
      totalScore += score;
    }

    // 平均等级
    const avgLevel = totalChildren > 0 ? (totalScore / totalChildren).toFixed(2) : '0.00';

    // 今日评估数（简化：返回最近24小时内的，这里用总数模拟）
    const todayCount = Math.min(portraits.length, 12);

    res.json({
      success: true,
      stats: {
        totalChildren,
        todayCount,
        classCount: classMap.size,
        avgLevel: parseFloat(avgLevel),
      },
    });
  } catch (error) {
    res.status(500).json({ error: '获取统计数据失败', message: (error as Error).message });
  }
});

// ========== 多轮对话 API ==========

// 开始对话
app.post('/api/conversation/start', async (req, res) => {
  try {
    const { childName, classId, scenario } = req.body;
    if (!childName) {
      return res.status(400).json({ error: '缺少 childName' });
    }

    const session = createSession(
      childName,
      classId || 'class_001',
      (scenario || 'smart_story_corner') as ScenarioType
    );

    // 根据场景选择开场白智能体
    const isNarrativeTrain = scenario === 'narrative_train';
    const greeting = isNarrativeTrain
      ? `${childName}，你好！我是小欧老师。故事火车要开啦！你来当第一节车厢，先告诉我们，故事发生在什么时候、在哪里呢？`
      : scenario === 'journey_podcast'
        ? `嗨，${childName}！我是多多！今天我们来聊一聊，你最近有什么好玩的事吗？`
        : `嗨，${childName}！我是多多！你今天想给我讲个什么故事呀？`;

    res.json({
      success: true,
      sessionId: session.sessionId,
      greeting,
      agentName: isNarrativeTrain ? '小欧老师' : '多多',
      maxTurns: 5,
    });
  } catch (error) {
    res.status(500).json({ error: '创建对话失败', message: (error as Error).message });
  }
});

// 对话轮次：孩子说话 → 多多回应
app.post('/api/conversation/turn', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: '缺少 sessionId 或 message' });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: '对话会话不存在或已过期' });
    }
    if (session.status !== 'active') {
      return res.status(400).json({ error: '对话已结束' });
    }

    // 记录孩子的发言
    addTurn(sessionId, 'child', message);

    // 根据场景选择对话智能体：叙事火车由小欧老师组织接力，其他场景由多多陪伴
    const scenario = session.scenario as string;
    const isNarrativeTrain = scenario === 'narrative_train';

    let peerMessage: string;
    let suggestEnd: boolean;
    let agentName: string;

    if (isNarrativeTrain) {
      // 叙事火车：小欧老师作为"车厢长"引导叙事接力
      const teacherAgent = system.teacherAgent;
      const result = await teacherAgent.generateTurnResponse(
        session.turns.map(t => ({ role: t.role, content: t.content })),
        session.scenario
      );
      peerMessage = result.message;
      suggestEnd = result.suggestEnd;
      agentName = '小欧老师';
    } else {
      // 其他场景：多多陪伴
      const peerAgent = system.peerAgent;
      const result = await peerAgent.generateTurnResponse(
        session.turns.map(t => ({ role: t.role, content: t.content })),
        session.scenario
      );
      peerMessage = result.message;
      suggestEnd = result.suggestEnd;
      agentName = '多多';
    }

    // 记录智能体的回应
    addTurn(sessionId, 'peer', peerMessage);

    const turnCount = getChildTurnCount(session);

    res.json({
      success: true,
      peerMessage,
      agentName,
      turnCount,
      maxTurns: 5,
      suggestEnd: shouldSuggestEnd(session),
    });
  } catch (error) {
    res.status(500).json({ error: '对话轮次失败', message: (error as Error).message });
  }
});

// 结束对话 → 触发三智能体评估
app.post('/api/conversation/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId' });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: '对话会话不存在或已过期' });
    }

    // 拼接所有孩子发言为完整叙事
    const narrativeInput = buildNarrativeInput(session);

    // 运行三智能体协作评估
    const result = await system.runScenario(session.scenario, narrativeInput);

    // 保存评估结果
    if (result.portrait) {
      markAssessed(sessionId, result.assessment, result.portrait);
    }

    const turns = [...session.turns];

    // 结果已返回给前端，释放会话内存
    removeSession(sessionId);

    res.json({
      success: true,
      sessionId,
      turns,
      childNarrative: narrativeInput.content,
      assessment: result.assessment,
      portrait: result.portrait,
      interactions: result.interactions,
      reflections: result.reflections,
    });
  } catch (error) {
    res.status(500).json({ error: '结束对话失败', message: (error as Error).message });
  }
});

// ========== 用户管理 API ==========

// 获取 PostgreSQL 存储实例
function getPostgres(): PostgresStorage | null {
  const storage = system.portraitStorage;
  return storage instanceof PostgresStorage ? storage : null;
}

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const pg = getPostgres();
    if (!pg) {
      // JSON 模式：硬编码账号
      const defaults: Record<string, { password: string; name: string; role: string }> = {
        teacher1: { password: '123456', name: '张老师', role: 'teacher' },
        teacher2: { password: '123456', name: '李老师', role: 'teacher' },
        teacher3: { password: '123456', name: '王老师', role: 'teacher' },
        teacher4: { password: '123456', name: '赵老师', role: 'teacher' },
        admin: { password: 'admin', name: '管理员', role: 'admin' },
      };
      const user = defaults[username];
      if (!user || user.password !== password) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      return res.json({ success: true, user: { id: username, name: user.name, role: user.role, avatar: user.role === 'admin' ? '🔧' : '👩‍🏫' } });
    }

    const user = await pg.getUser(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    res.json({
      success: true,
      user: { id: username, name: user.name, role: user.role, classId: user.class_id, avatar: user.avatar },
    });
  } catch (error) {
    res.status(500).json({ error: '登录失败', message: (error as Error).message });
  }
});

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, classId } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const pg = getPostgres();
    if (!pg) {
      return res.status(503).json({ error: '当前为本地模式，请联系管理员' });
    }

    const existing = await pg.getUser(username);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const hash = await bcrypt.hash(password, 10);
    const ok = await pg.createUser(username, hash, name, 'teacher', classId);
    if (!ok) {
      return res.status(500).json({ error: '注册失败' });
    }

    res.json({ success: true, user: { id: username, name, role: 'teacher', classId, avatar: '👩‍🏫' } });
  } catch (error) {
    res.status(500).json({ error: '注册失败', message: (error as Error).message });
  }
});

// 获取用户列表（管理员）
app.get('/api/auth/users', async (req, res) => {
  try {
    const pg = getPostgres();
    if (!pg) {
      return res.json({ success: true, users: [
        { username: 'teacher1', name: '张老师', role: 'teacher', avatar: '👩‍🏫' },
        { username: 'admin', name: '管理员', role: 'admin', avatar: '🔧' },
      ]});
    }
    const users = await pg.listUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 修改密码
app.post('/api/auth/password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const pg = getPostgres();
    if (!pg) {
      return res.status(503).json({ error: '当前为本地模式' });
    }

    const user = await pg.getUser(username);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: '原密码错误' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pg.updatePassword(username, hash);
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

// 删除用户（管理员）
app.delete('/api/auth/user/:username', async (req, res) => {
  try {
    const pg = getPostgres();
    if (!pg) return res.status(503).json({ error: '当前为本地模式' });
    const ok = await pg.deleteUser(req.params.username);
    res.json({ success: ok });
  } catch (error) {
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 启动时创建默认管理员
async function seedDefaultUsers() {
  const pg = getPostgres();
  if (!pg) return;

  const admin = await pg.getUser('admin');
  if (!admin) {
    const hash = await bcrypt.hash('admin', 10);
    await pg.createUser('admin', hash, '管理员', 'admin', undefined, '🔧');
    console.log('👤 已创建默认管理员: admin/admin');
  }

  for (let i = 1; i <= 4; i++) {
    const name = `teacher${i}`;
    const exists = await pg.getUser(name);
    if (!exists) {
      const hash = await bcrypt.hash('123456', 10);
      const teacherNames = ['张老师', '李老师', '王老师', '赵老师'];
      await pg.createUser(name, hash, teacherNames[i - 1], 'teacher', `class_00${i}`);
      console.log(`👤 已创建默认教师: ${name}/123456`);
    }
  }
}

// ========== TTS 语音合成 ==========
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const ttsCacheDir = join(tmpdir(), 'doo-tts');
mkdirSync(ttsCacheDir, { recursive: true });
// 持久化 edge-tts 环境（放项目目录，避免系统重启清空 /tmp 导致语音丢失）
const EDGE_TTS_PYTHON = process.env.EDGE_TTS_PYTHON || resolve(__dirname, '../.edgetts/bin/python3');
const TTS_VOICE = 'zh-CN-YunxiaNeural'; // 可爱男童声

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, rate } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: '缺少 text 参数' });
    }

    const v = voice || TTS_VOICE;
    const r = rate || '+0%';
    const hash = createHash('md5').update(`${v}|${r}|${text}`).digest('hex').slice(0, 12);
    const outFile = join(ttsCacheDir, `${hash}.mp3`);

    // 缓存命中
    if (existsSync(outFile)) {
      const audio = readFileSync(outFile);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(audio);
    }

    // 异步调用 edge-tts 生成语音（不阻塞事件循环）
    await execFileAsync(EDGE_TTS_PYTHON, [
      '-m', 'edge_tts',
      '--text', text,
      '--voice', v,
      '--rate', r,
      '--write-media', outFile,
    ], { timeout: 10000 });

    const audio = readFileSync(outFile);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  } catch (error) {
    console.error('TTS 生成失败:', (error as Error).message);
    res.status(500).json({ error: '语音合成失败' });
  }
});

// ========== STT 语音识别（本地 whisper，不依赖谷歌服务） ==========
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const STT_PYTHON = process.env.STT_PYTHON || resolve(__dirname, '../.stt/bin/python3');
const STT_WORKER = resolve(__dirname, 'stt_worker.py');
const STT_MODEL = process.env.STT_MODEL || 'small';
const sttTmpDir = join(tmpdir(), 'doo-stt');
mkdirSync(sttTmpDir, { recursive: true });

let sttWorker: ChildProcess | null = null;
let sttBootPromise: Promise<void> | null = null;
let sttReqSeq = 0;
const sttPending = new Map<string, { resolve: (r: { ok: boolean; text?: string; error?: string }) => void; timer: NodeJS.Timeout }>();

function killSttWorker(): void {
  if (sttWorker) {
    sttWorker.removeAllListeners();
    sttWorker.kill();
    sttWorker = null;
  }
  sttBootPromise = null;
  for (const [, p] of sttPending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error: '语音识别服务已退出' });
  }
  sttPending.clear();
}

function ensureSttWorker(): Promise<void> {
  if (sttWorker && !sttWorker.killed) return Promise.resolve();
  if (sttBootPromise) return sttBootPromise;

  sttBootPromise = new Promise<void>((resolveBoot, rejectBoot) => {
    let proc: ChildProcess;
    try {
      proc = spawn(STT_PYTHON, [STT_WORKER], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, STT_MODEL },
      });
    } catch (e) {
      sttBootPromise = null;
      rejectBoot(e);
      return;
    }
    sttWorker = proc;

    let booted = false;
    // 首次启动包含模型下载（约500MB），给足时间
    const bootTimer = setTimeout(() => {
      if (!booted) {
        killSttWorker();
        rejectBoot(new Error('语音识别服务启动超时'));
      }
    }, 300000);

    proc.stdout!.on('data', (d: Buffer) => {
      for (const ln of d.toString().split('\n')) {
        const line = ln.trim();
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.ready && !booted) {
            booted = true;
            clearTimeout(bootTimer);
            resolveBoot();
            continue;
          }
          if (msg.id) {
            const p = sttPending.get(msg.id);
            if (p) {
              sttPending.delete(msg.id);
              clearTimeout(p.timer);
              p.resolve(msg);
            }
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    });

    proc.stderr!.on('data', (d: Buffer) => {
      const s = d.toString().trim();
      if (s) console.error('[stt-worker]', s);
    });

    proc.on('exit', () => {
      clearTimeout(bootTimer);
      if (!booted) {
        sttBootPromise = null;
        sttWorker = null;
        rejectBoot(new Error('语音识别服务启动失败，请检查 .stt 环境'));
      } else {
        killSttWorker();
      }
    });
  });
  return sttBootPromise;
}

/** 按文件头魔数识别真实音频格式（浏览器录音可能是 webm/mp4/wav 等，扩展名必须匹配真实内容） */
function detectAudioExt(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'; // EBML
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a'; // Safari MediaRecorder
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'RIFF') return 'wav';
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (buf.length >= 3 && buf.slice(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG audio frame
  if (buf.length >= 2 && buf[0] === 0x2d && buf[1] === 0x2d) {
    throw new Error('收到的是表单数据而非音频，请强制刷新页面（Cmd+Shift+R）后重试');
  }
  throw new Error('无法识别的音频格式');
}

app.post('/api/stt', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => {
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) {
    return res.status(400).json({ error: '音频数据无效或太短' });
  }

  // 按真实内容决定扩展名，避免格式与后缀不匹配导致解码失败
  let ext: string;
  try {
    ext = detectAudioExt(audio);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const id = `stt_${Date.now()}_${++sttReqSeq}`;
  const inFile = join(sttTmpDir, `${id}.${ext}`);
  try {
    await ensureSttWorker();
    writeFileSync(inFile, audio);

    const result = await new Promise<{ ok: boolean; text?: string; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        sttPending.delete(id);
        reject(new Error('识别超时'));
      }, 120000);
      sttPending.set(id, { resolve, timer });
      sttWorker!.stdin!.write(JSON.stringify({ id, file: inFile }) + '\n');
    });

    if (!result.ok) throw new Error(result.error || '识别失败');
    res.json({ ok: true, text: result.text || '' });
  } catch (error) {
    console.error('STT 识别失败:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message || '语音识别失败' });
  } finally {
    try { unlinkSync(inFile); } catch { /* 文件可能未写入 */ }
  }
});

// ========== 静态文件托管（生产环境） ==========
import { existsSync } from 'fs';
const distPath = resolve(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
  });
  console.log(`📁 前端静态文件已托管: ${distPath}`);
}

app.listen(port, () => {
  console.log(`🚀 DOO多智能体API服务运行在 http://localhost:${port}`);
});
