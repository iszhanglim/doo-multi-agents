import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { DOOMultiAgentSystem } from '../../src';
import { PostgresStorage } from '../../src/portrait/PostgresStorage';
import { NarrativeInput } from '../../src/core/types';
import { sanitizeMetaText, sanitizeMetaList } from '../../src/nlp/sanitize';
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
// 两层防护，职责严格区分：
//
//  1) ACCESS_CODE —— 站点级共享口令（HTTP Basic）。设置后，除 /api/health 外的
//     所有请求都需要 Basic 认证（用户名任意，密码填 ACCESS_CODE）。
//     作用：把整个站点挡在门外，防止链接外泄被任意访问。
//     关键限制：它是「全员同一个」的共享口令，**无法区分身份**，
//     因此绝不能承担授权职责（此前用它保护用户管理接口是错的）。
//
//  2) 登录令牌 —— 身份与角色（HMAC 签名，无状态）。登录成功后签发，
//     通过自定义头 `X-Auth-Token` 回传（不用 Authorization，避免与浏览器缓存的
//     Basic 凭证互斥）。管理类接口在此基础上再校验角色。
//
//  环境变量：
//    ACCESS_CODE               站点共享口令，公网必填；不设置则站点完全公开（仅本地开发）
//    ACCESS_REALM              Basic 认证提示语，默认 "DOO Multi-Agent"
//    AUTH_SECRET               登录令牌签名密钥，默认复用 ACCESS_CODE
//    AUTH_TOKEN_TTL_HOURS      令牌有效期（小时），默认 12
//    RATE_LIMIT_PER_MIN        每 IP 每分钟 /api/* 上限，默认 120；设 0 关闭
//    RATE_LIMIT_GLOBAL_PER_MIN 全站每分钟上限（兜底），默认 RATE_LIMIT_PER_MIN×10
//
// /api/health 必须保持公开：平台（扣子编程、Railway）用它做健康检查，
// 一旦加鉴权会导致部署失败。
// ===========================================================================
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const ACCESS_REALM = process.env.ACCESS_REALM || 'DOO Multi-Agent';
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
const RATE_LIMIT_GLOBAL_PER_MIN = Number(
  process.env.RATE_LIMIT_GLOBAL_PER_MIN ??
    (RATE_LIMIT_PER_MIN > 0 ? RATE_LIMIT_PER_MIN * 10 : 0)
);

/** 令牌签名密钥（默认复用 ACCESS_CODE；生产更推荐单独设置 AUTH_SECRET） */
const AUTH_SECRET = (process.env.AUTH_SECRET || ACCESS_CODE || 'doo-dev-insecure-secret').trim();
const AUTH_TOKEN_TTL_MS = (Number(process.env.AUTH_TOKEN_TTL_HOURS) || 12) * 60 * 60 * 1000;
/** 承载登录令牌的自定义头（避免与 Basic 共用一个 Authorization 字段） */
const AUTH_HEADER = 'x-auth-token';

if (!ACCESS_CODE) {
  console.warn('⚠️  未设置 ACCESS_CODE —— 所有接口当前处于公开状态，公网部署前请务必设置');
}
if (!process.env.AUTH_SECRET && !ACCESS_CODE) {
  console.warn('⚠️  未设置 AUTH_SECRET 且未设置 ACCESS_CODE —— 令牌使用内置开发密钥，请勿用于生产');
}

/** 探活与前置检查必须放行 */
const PUBLIC_PATHS = new Set(['/api/health']);

// --- 简易滑动窗口限流（内存实现，单实例有效）---
const HIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
/**
 * 全站计数。
 * 按 IP 限流依赖 X-Forwarded-For，而该头在网关未强制重写时可被伪造，
 * 伪造后每个请求都是「新 IP」→ 按 IP 限流形同虚设。全站上限用于兜住这种最坏情况，
 * 直接保护 LLM 额度不被刷爆。
 */
let globalHits: number[] = [];

function pruneWindow(arr: number[], now: number): number[] {
  return arr.filter((t) => now - t < HIT_WINDOW_MS);
}

function isRateLimited(ip: string): boolean {
  if (!RATE_LIMIT_PER_MIN || RATE_LIMIT_PER_MIN <= 0) return false;
  const now = Date.now();
  const arr = pruneWindow(hits.get(ip) || [], now);
  if (arr.length >= RATE_LIMIT_PER_MIN) {
    hits.set(ip, arr); // 保留窗口内时间戳，便于后续重试
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 10_000) hits.clear(); // 防止 Map 无限增长
  return false;
}

/** 全站滑窗；超过 RATE_LIMIT_GLOBAL_PER_MIN 时拒绝（0 表示关闭） */
function isGlobalRateLimited(): boolean {
  if (!RATE_LIMIT_GLOBAL_PER_MIN || RATE_LIMIT_GLOBAL_PER_MIN <= 0) return false;
  const now = Date.now();
  globalHits = pruneWindow(globalHits, now);
  if (globalHits.length >= RATE_LIMIT_GLOBAL_PER_MIN) return true;
  globalHits.push(now);
  return false;
}

// =========== 登录令牌（HMAC 签名，无状态，可跨实例） ===========

interface AuthTokenPayload {
  /** username */
  u: string;
  /** role: teacher | admin */
  r: string;
  /** 过期时间戳（ms） */
  e: number;
}

function signAuthToken(user: { username: string; role: string }): string {
  const payload: AuthTokenPayload = {
    u: user.username,
    r: user.role,
    e: Date.now() + AUTH_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
  const sep = token.indexOf('.');
  if (sep <= 0) return null;
  const body = token.slice(0, sep);
  const sig = token.slice(sep + 1);

  const expected = createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  const given = Buffer.from(sig, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  // 长度不等时 timingSafeEqual 直接抛错，必须先短路
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!payload || typeof payload.u !== 'string' || typeof payload.e !== 'number') return null;
    if (payload.e < Date.now()) return null; // 已过期
    return payload;
  } catch {
    return null;
  }
}

/** 解析当前登录用户（无令牌 / 签名错 / 过期 均返回 null） */
function getAuthUser(req: Request): AuthTokenPayload | null {
  const raw = req.headers[AUTH_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return null;
  return verifyAuthToken(token.trim());
}

/** 要求已登录（任意角色） */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!getAuthUser(req)) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  next();
}

/** 要求管理员角色 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  if (user.r !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  next();
}

// 反向代理后取真实客户端 IP；trust proxy=1 表示只信任紧邻的一跳（平台网关）
app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next(); // 放行 CORS 预检，预检请求不携带凭证
  if (PUBLIC_PATHS.has(req.path)) return next();

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (isGlobalRateLimited()) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: '服务请求总量过高，请稍后再试' });
  }
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!ACCESS_CODE) return next();

  // 站点级口令只校验 Basic 头；登录令牌走 X-Auth-Token，两者互不干扰
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

/**
 * 合法场景类型。
 * 场景值来自请求体/路径参数，此前一律 `as ScenarioType` 纯类型断言，
 * 非法值会一路穿到 `runScenario` 的 default 分支抛错，最终以 500 返回（应为 400）。
 */
const SCENARIO_TYPES = ['smart_story_corner', 'narrative_train', 'journey_podcast'] as const;
type ScenarioTypeName = (typeof SCENARIO_TYPES)[number];

function isScenarioType(value: unknown): value is ScenarioTypeName {
  return typeof value === 'string' && (SCENARIO_TYPES as readonly string[]).includes(value);
}

/** 单次叙事文本上限（字）。超长文本会直接进入 LLM prompt，撑大 token 与内存 */
const MAX_NARRATIVE_CHARS = 2000;
/** 多轮对话中单条发言上限（字） */
const MAX_MESSAGE_CHARS = 500;
/** TTS 单次合成文本上限（字），同时用于限制缓存体积与计费 */
const MAX_TTS_CHARS = 500;

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

// ========== LLM 元话语清洗（P0-2 兜底） ==========
// AssessmentEngine 已在生成侧清洗；这里对响应再做一层兜底，
// 覆盖历史落库数据中混入的"输出风格/内容已验证"等元话语。
function sanitizeReportText(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  // 按行处理，避免破坏 Markdown 结构（标题、表格、列表）
  return text.split(/\r?\n/).map((line) => sanitizeMetaText(line)).join('\n');
}

function sanitizeAssessmentInPlace(assessment: unknown): void {
  if (!assessment || typeof assessment !== 'object') return;
  const a = assessment as { suggestions?: unknown };
  if (Array.isArray(a.suggestions)) {
    a.suggestions = sanitizeMetaList(a.suggestions as unknown[]);
  }
}

function sanitizePortraitInPlace(portrait: unknown): void {
  if (!portrait || typeof portrait !== 'object') return;
  const p = portrait as {
    basePortrait?: { assessments?: unknown };
    progressivePortraits?: unknown;
  };
  const cleanAssessments = (assessments: unknown): void => {
    if (!Array.isArray(assessments)) return;
    for (const item of assessments) {
      if (item && typeof item === 'object') sanitizeAssessmentInPlace(item);
    }
  };
  if (p.basePortrait) cleanAssessments(p.basePortrait.assessments);
  if (Array.isArray(p.progressivePortraits)) {
    for (const pp of p.progressivePortraits) {
      cleanAssessments((pp as { assessments?: unknown } | null)?.assessments);
    }
  }
}

// 评估叙事
app.post('/api/assess', async (req, res) => {
  try {
    const { childId, childName, classId, content, scenario } = req.body;

    if (
      typeof childName !== 'string' ||
      !childName.trim() ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      return res.status(400).json({ error: '缺少必要参数: childName, content' });
    }
    if (content.length > MAX_NARRATIVE_CHARS) {
      return res.status(413).json({ error: `叙事内容过长（上限 ${MAX_NARRATIVE_CHARS} 字）` });
    }

    // 非法场景值回落到默认值，而不是断言后穿到 runScenario 抛 500
    const scenarioType: ScenarioTypeName = isScenarioType(scenario) ? scenario : 'smart_story_corner';

    const input: NarrativeInput = {
      childId: childId || stableChildId(childName, classId || 'class_001'),
      childName: childName.trim(),
      classId: classId || 'class_001',
      content: content.trim(),
      scenario: scenarioType,
      timestamp: new Date(),
    };

    // 使用场景运行来评估并保存画像
    const result = await system.runScenario(scenarioType, input);

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

    // 元话语兜底清洗（覆盖历史数据与生成侧遗漏）
    sanitizeAssessmentInPlace(result.assessment);
    if (result.portrait) sanitizePortraitInPlace(result.portrait);

    res.json({
      success: true,
      assessment: result.assessment,
      portrait: result.portrait,
      childId: input.childId,
      interactions: result.interactions,
      reflections: result.reflections ?? [],
      report: sanitizeReportText(reportText),
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

    if (!isScenarioType(type)) {
      return res.status(400).json({ error: `未知场景类型: ${type}`, allowed: [...SCENARIO_TYPES] });
    }

    const input: NarrativeInput = {
      childId: childId || stableChildId(childName || '匿名', classId || 'class_001'),
      childName: childName || '匿名',
      classId: classId || 'class_001',
      content: content || '',
      scenario: type,
      timestamp: new Date(),
    };

    const result = await system.runScenario(type, input);

    // 元话语兜底清洗
    sanitizeAssessmentInPlace(result.assessment);
    if (result.portrait) sanitizePortraitInPlace(result.portrait);

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

    // 元话语兜底清洗（历史落库数据）
    sanitizePortraitInPlace(portrait);

    res.json({ success: true, portrait });
  } catch (error) {
    res.status(500).json({ error: '获取画像失败', message: (error as Error).message });
  }
});

// 获取所有画像
app.get('/api/portraits', async (req, res) => {
  try {
    let portraits = await system.portraitStorage.loadAllPortraits();
    // 班级老师只看本班学生；admin（无 classId）看全部
    const classId = typeof req.query.classId === 'string' ? req.query.classId.trim() : '';
    if (classId) portraits = portraits.filter((p) => p.classId === classId);
    // 元话语兜底清洗（历史落库数据）
    for (const p of portraits) sanitizePortraitInPlace(p);
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
    res.json({ success: true, report: sanitizeReportText(report) });
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
    let portraits = await system.portraitStorage.loadAllPortraits();
    // 与 /api/portraits 同口径：班级老师只统计本班学生
    const classId = typeof req.query.classId === 'string' ? req.query.classId.trim() : '';
    if (classId) portraits = portraits.filter((p) => p.classId === classId);

    // 幼儿总数
    const totalChildren = portraits.length;

    // 班级统计
    const classMap = new Map<string, number>();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // 近 24 小时内的评估次数：按 basePortrait.assessments 的真实时间戳统计
    // （原先为 `Math.min(portraits.length, 12)`，是硬编码假数据）
    let todayCount = 0;
    // 平均等级：与页面展示的「整体水平」同口径 —— 取每个幼儿最近一次评估的 overallLevel
    // （由 DOOModel.calculateOverallLevel 按 8 个观测点求得），
    // 而不是三维雷达均值，避免同一个数字在不同页面含义不一致。
    let levelSum = 0;
    let levelCount = 0;

    for (const portrait of portraits) {
      classMap.set(portrait.classId, (classMap.get(portrait.classId) || 0) + 1);

      const assessments = portrait.basePortrait?.assessments ?? [];
      for (const assessment of assessments) {
        const at = new Date(assessment.timestamp).getTime();
        if (!Number.isNaN(at) && at >= dayAgo) todayCount++;
      }

      const latest = assessments[assessments.length - 1];
      if (latest) {
        levelSum += latest.overallLevel;
        levelCount++;
      }
    }

    const avgLevel = levelCount > 0 ? Math.round((levelSum / levelCount) * 100) / 100 : 0;

    res.json({
      success: true,
      stats: {
        totalChildren,
        todayCount,
        classCount: classMap.size,
        avgLevel,
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
    if (typeof childName !== 'string' || !childName.trim()) {
      return res.status(400).json({ error: '缺少 childName' });
    }

    // 同样做白名单校验，不再用 `as ScenarioType` 断言后传入
    const scenarioType: ScenarioTypeName = isScenarioType(scenario) ? scenario : 'smart_story_corner';

    const session = createSession(childName.trim(), classId || 'class_001', scenarioType);

    // 根据场景选择开场白智能体
    const isNarrativeTrain = scenarioType === 'narrative_train';
    const greeting = isNarrativeTrain
      ? `${childName}，你好！我是小欧老师。故事火车要开啦！你来当第一节车厢，先告诉我们，故事发生在什么时候、在哪里呢？`
      : scenarioType === 'journey_podcast'
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
    if (
      typeof sessionId !== 'string' ||
      !sessionId ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return res.status(400).json({ error: '缺少 sessionId 或 message' });
    }
    // 单条发言会直接拼进下游 LLM prompt，必须限长（原先无任何长度/类型校验）
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(413).json({ error: `单条发言过长（上限 ${MAX_MESSAGE_CHARS} 字）` });
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

    // 会话在响应真正写完后才释放：
    // 若客户端中途断开导致 res.json 失败，会话仍然存在，用户可以重试 /end。
    res.on('finish', () => removeSession(sessionId));

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

// 默认口令清单：命中则要求首次登录后强制修改密码（P0-1）
// 生产环境登录页不再展示测试账号，保留清单仅用于标记 mustChangePassword
const DEFAULT_PASSWORDS: Record<string, string> = {
  teacher1: '123456',
  teacher2: '123456',
  teacher3: '123456',
  teacher4: '123456',
  admin: 'admin',
};

function isDefaultPassword(username: string, password: string): boolean {
  return DEFAULT_PASSWORDS[username] === password;
}

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const pg = getPostgres();
    if (!pg) {
      // JSON 模式：硬编码账号（仅本地演示；角色同样签发令牌，保证鉴权链路一致）
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
      return res.json({
        success: true,
        user: { id: username, name: user.name, role: user.role, avatar: user.role === 'admin' ? '🔧' : '👩‍🏫' },
        token: signAuthToken({ username, role: user.role }),
        mustChangePassword: isDefaultPassword(username, password),
      });
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
      token: signAuthToken({ username, role: user.role }),
      mustChangePassword: isDefaultPassword(username, password),
    });
  } catch (error) {
    res.status(500).json({ error: '登录失败', message: (error as Error).message });
  }
});

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, classId } = req.body;
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof name !== 'string' ||
      !username ||
      !password ||
      !name
    ) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    // 收紧入参，避免脏数据与超弱口令（注册页与管理员加人均走这里）
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母、数字、下划线或短横线' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
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

// 获取用户列表（仅管理员 —— 返回全部用户名与角色，必须鉴权）
app.get('/api/auth/users', requireAdmin, async (req, res) => {
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

// 修改密码（本人；管理员可代改他人）
// 原先无任何授权校验 —— 只持共享口令即可改任意用户密码。
app.post('/api/auth/password', requireAuth, async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ error: '请先登录' });
    }

    const { username, oldPassword, newPassword } = req.body;
    if (
      typeof username !== 'string' ||
      typeof oldPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !username ||
      !oldPassword ||
      !newPassword
    ) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    // 令牌里的身份必须与目标账号一致，除非调用者是管理员
    if (authUser.u !== username && authUser.r !== 'admin') {
      return res.status(403).json({ error: '只能修改自己的密码' });
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

// 删除用户（仅管理员）
// 原先无任何授权校验 —— 只持共享口令即可删除任意用户（含 admin）。
app.delete('/api/auth/user/:username', requireAdmin, async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const target = req.params.username;
    if (authUser && authUser.u === target) {
      return res.status(400).json({ error: '不能删除当前登录的账号' });
    }
    const pg = getPostgres();
    if (!pg) return res.status(503).json({ error: '当前为本地模式' });
    const ok = await pg.deleteUser(target);
    res.json({ success: ok });
  } catch (error) {
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 更新用户资料（仅管理员）
// 前端 AdminUsersPage 一直在调用该能力，但后端此前并无对应接口（前端为伪实现）。
// 这里复用 PostgresStorage.updateUser —— 它已对列名做白名单校验。
app.patch('/api/auth/user/:username', requireAdmin, async (req, res) => {
  try {
    const body = (req.body || {}) as {
      name?: unknown;
      classId?: unknown;
      role?: unknown;
      avatar?: unknown;
    };

    const updates: { name?: string; role?: string; class_id?: string; avatar?: string } = {};
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.classId === 'string' && body.classId.trim()) updates.class_id = body.classId.trim();
    if (typeof body.avatar === 'string' && body.avatar.trim()) updates.avatar = body.avatar.trim();
    // 角色只允许这两个取值，避免写入任意字符串
    if (body.role === 'teacher' || body.role === 'admin') updates.role = body.role;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    const pg = getPostgres();
    if (!pg) return res.status(503).json({ error: '当前为本地模式' });

    const ok = await pg.updateUser(req.params.username, updates);
    if (!ok) return res.status(404).json({ error: '用户不存在' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '更新用户失败', message: (error as Error).message });
  }
});

// 管理员重置他人密码（无需旧密码；本人改密走 /api/auth/password）
app.post('/api/auth/user/:username/password', requireAdmin, async (req, res) => {
  try {
    const newPassword = (req.body || {}).newPassword;
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }

    const pg = getPostgres();
    if (!pg) return res.status(503).json({ error: '当前为本地模式' });

    const user = await pg.getUser(req.params.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const hash = await bcrypt.hash(newPassword, 10);
    const ok = await pg.updatePassword(req.params.username, hash);
    res.json({ success: ok });
  } catch (error) {
    res.status(500).json({ error: '重置密码失败' });
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
// createHash 已在文件头导入（原先在此处重复 import）
import { mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TTSClient, ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const execFileAsync = promisify(execFile);
const ttsCacheDir = join(tmpdir(), 'doo-tts');
mkdirSync(ttsCacheDir, { recursive: true });
const TTS_SPEAKER = 'zh_male_naiqimengwa_uranus_bigtts'; // 托管音色：奶气萌娃 2.0（剪映/豆包同款男童声，大班男孩可爱音）

// 火山引擎 TTS（剪映同款音色源）。配置了 AppID/Token 即优先走火山原生，
// 未配置或合成失败时回落平台托管 TTS。剪映男童声候选（官方音色列表 6561/1257544）：
//   zh_male_naiqimengwa_uranus_bigtts   奶气萌娃 2.0（剪映同款,豆包同款）
//   zh_male_tiancaitongsheng_uranus_bigtts 天才童声 2.0
//   zh_male_kailangdidi_uranus_bigtts   开朗弟弟 2.0（抖音同款,剪映同款）
const VOLC_TTS_APPID = (process.env.VOLC_TTS_APPID || '').trim();
const VOLC_TTS_TOKEN = (process.env.VOLC_TTS_TOKEN || '').trim();
const VOLC_TTS_VOICE = (process.env.VOLC_TTS_VOICE || 'zh_male_naiqimengwa_uranus_bigtts').trim();
const VOLC_TTS_CLUSTER = (process.env.VOLC_TTS_CLUSTER || 'volcano_tts').trim();
const VOLC_TTS_API = 'https://openspeech.bytedance.com/api/v1/tts';
const volcTtsEnabled = Boolean(VOLC_TTS_APPID && VOLC_TTS_TOKEN);
if (volcTtsEnabled) {
  console.log(`🎙️ 火山引擎 TTS 已启用，音色: ${VOLC_TTS_VOICE}`);
}

/** 火山 v1 HTTP 非流式 TTS（大模型音色）：响应 JSON.data 为 base64 mp3，code 3000 为成功 */
async function volcSynthesize(text: string, speedRatio: number): Promise<Buffer> {
  const resp = await fetch(VOLC_TTS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer;${VOLC_TTS_TOKEN}`,
    },
    body: JSON.stringify({
      app: { appid: VOLC_TTS_APPID, token: VOLC_TTS_TOKEN, cluster: VOLC_TTS_CLUSTER },
      user: { uid: 'doo-multi-agent' },
      audio: { voice_type: VOLC_TTS_VOICE, encoding: 'mp3', speed_ratio: speedRatio },
      request: { reqid: randomUUID(), text, operation: 'query' },
    }),
  });
  const json = (await resp.json()) as { code?: number; message?: string; data?: string };
  if (json.code !== 3000 || !json.data) {
    throw new Error(`火山 TTS 失败 code=${json.code}: ${json.message}`);
  }
  return Buffer.from(json.data, 'base64');
}

/** TTS 缓存有效期。沙箱磁盘仅 3GB，缓存必须可回收（原先只写不删） */
const TTS_CACHE_TTL_MS = (Number(process.env.TTS_CACHE_TTL_HOURS) || 24) * 60 * 60 * 1000;

/** 清理过期 TTS 缓存：启动时一次 + 每小时一次 */
function cleanTtsCache(): void {
  let removed = 0;
  try {
    const now = Date.now();
    for (const name of readdirSync(ttsCacheDir)) {
      if (!name.endsWith('.mp3')) continue;
      const file = join(ttsCacheDir, name);
      try {
        if (now - statSync(file).mtimeMs > TTS_CACHE_TTL_MS) {
          unlinkSync(file);
          removed++;
        }
      } catch {
        /* 可能已被并发删除，忽略 */
      }
    }
    if (removed > 0) console.log(`🧹 已清理 ${removed} 个过期 TTS 缓存`);
  } catch (error) {
    console.warn('TTS 缓存清理失败:', error instanceof Error ? error.message : error);
  }
}
cleanTtsCache();
setInterval(cleanTtsCache, 60 * 60 * 1000).unref(); // unref：不阻止进程退出

async function fetchAudio(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`语音下载失败: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

app.post('/api/tts', async (req, res) => {
  try {
    const { text, rate } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: '缺少 text 参数' });
    }
    // 限长：否则可用它无限占用磁盘缓存，并放大合成计费
    if (text.length > MAX_TTS_CHARS) {
      return res.status(413).json({ error: `文本过长（上限 ${MAX_TTS_CHARS} 字）` });
    }

    const speechRate = typeof rate === 'string' ? parseInt(rate, 10) || 0 : 0; // '+5%' -> 5

    // 火山原生音色（如奶气萌娃）本身已足够幼态，前端不再叠加变调，通过响应头告知
    const useVolc = volcTtsEnabled;
    const providerKey = useVolc ? `volc|${VOLC_TTS_VOICE}` : `coze|${TTS_SPEAKER}`;
    const hash = createHash('md5').update(`${providerKey}|${speechRate}|${text}`).digest('hex').slice(0, 12);
    const outFile = join(ttsCacheDir, `${hash}.mp3`);

    // 缓存命中
    if (existsSync(outFile)) {
      const audio = readFileSync(outFile);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-TTS-Provider', useVolc ? 'volc' : 'coze');
      return res.send(audio);
    }

    let audio: Buffer;
    if (useVolc) {
      try {
        // 火山 v1 接口：speed_ratio 范围 [0.1, 2]，'+12%' -> 1.12
        audio = await volcSynthesize(text, Math.min(2, Math.max(0.1, 1 + speechRate / 100)));
        writeFileSync(outFile, audio);
      } catch (err) {
        console.warn('火山 TTS 失败，回落平台托管:', (err as Error).message);
        audio = await synthesizeViaCoze(req, text, speechRate);
        writeFileSync(outFile, audio);
      }
    } else {
      audio = await synthesizeViaCoze(req, text, speechRate);
      writeFileSync(outFile, audio);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-TTS-Provider', useVolc ? 'volc' : 'coze');
    res.send(audio);
  } catch (error) {
    console.error('TTS 生成失败:', (error as Error).message);
    res.status(500).json({ error: '语音合成失败' });
  }
});

/** 平台托管 TTS 合成（coze-coding-dev-sdk），下载 mp3 后返回 */
async function synthesizeViaCoze(req: Request, text: string, speechRate: number): Promise<Buffer> {
  const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
  const tts = new TTSClient(new Config(), customHeaders);
  const response = await tts.synthesize({ uid: 'doo-multi-agent', text, speaker: TTS_SPEAKER, speechRate });
  return fetchAudio(response.audioUri);
}

// ========== STT 语音识别（平台托管 ASR，不依赖本地模型） ==========
const sttTmpDir = join(tmpdir(), 'doo-stt');
mkdirSync(sttTmpDir, { recursive: true });

/**
 * ffmpeg 是否可用（惰性探测 + 结果缓存）。
 * 前端自 2026-09-21 起改为 Web Audio 采集 WAV 直传，主路径已不依赖转码；
 * 但旧客户端/其他调用方仍可能上传 webm。这里提前探测，
 * 缺失时给出明确日志与可读的业务错误，而不是让用户看到 `spawn ffmpeg ENOENT`。
 */
let ffmpegAvailable: boolean | null = null;

async function probeFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    console.warn(
      '⚠️  未检测到 ffmpeg —— 上传 webm 音频将无法转码（前端已改为直传 WAV，正常使用不受影响）'
    );
  }
  return ffmpegAvailable;
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

// 上限与平台一致（部署后单文件 16MB）：超过时在应用层返回可读错误，
// 而不是被平台层直接拒收（那样前端只能拿到不可读的失败）。
app.post('/api/stt', express.raw({ type: () => true, limit: '16mb' }), async (req, res) => {
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

  // 托管 ASR 支持 wav/mp3/ogg/m4a；webm（Chrome 默认录音格式）先经 ffmpeg 转 16k 单声道 wav
  const id = `stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inFile = join(sttTmpDir, `${id}.${ext}`);
  const outFile = join(sttTmpDir, `${id}.wav`);
  try {
    let asrBuf = audio;
    if (ext === 'webm') {
      if (!(await probeFfmpeg())) {
        return res.status(415).json({
          error: '服务端未安装 ffmpeg，无法处理 webm 音频；请强制刷新页面（Cmd+Shift+R）以使用新版录音（WAV 直传）',
        });
      }
      writeFileSync(inFile, audio);
      await execFileAsync('ffmpeg', ['-y', '-i', inFile, '-ar', '16000', '-ac', '1', outFile], { timeout: 30000 });
      asrBuf = readFileSync(outFile);
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
    const asr = new ASRClient(new Config(), customHeaders);
    const result = await asr.recognize({ base64Data: asrBuf.toString('base64') });
    res.json({ ok: true, text: result.text || '' });
  } catch (error) {
    console.error('STT 识别失败:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message || '语音识别失败' });
  } finally {
    for (const f of [inFile, outFile]) {
      try { unlinkSync(f); } catch { /* 未生成 */ }
    }
  }
});

// ========== 静态文件托管（生产环境） ==========
// existsSync 已在文件上方导入（原先在此处重复 import）
const distPath = resolve(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // 仅对非 /api 路径回落到 index.html（SPA history 路由需要）。
  // 原先的 app.get('*') 会把 /api/typo 这类 GET 也返回 200 + HTML，
  // 掩盖 404，并误导前端与探活脚本。
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
  });
  console.log(`📁 前端静态文件已托管: ${distPath}`);
}

// 未匹配的 /api 路由统一返回 JSON 404（置于静态托管之后，避免被 SPA 兜底吞掉）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(port, () => {
  console.log(`🚀 DOO多智能体API服务运行在 http://localhost:${port}`);
  // 启动时探一次 ffmpeg，部署日志中可直接看出转码能力
  void probeFfmpeg();
});
