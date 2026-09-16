/**
 * @deprecated 此为旧版Web服务器（端口3000），建议使用 Express 版本。
 * 运行方式：cd web && npm run server:dev（端口3001，配合 React 前端）
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

import { DOOMultiAgentSystem } from '../index';
import { NarrativeInput, ScenarioType, ChildPortrait } from '../core/types';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const system = new DOOMultiAgentSystem();

type JsonRecord = Record<string, unknown>;

const SCENARIOS: ScenarioType[] = ['smart_story_corner', 'narrative_train', 'journey_podcast'];

function isScenarioType(value: unknown): value is ScenarioType {
  return typeof value === 'string' && SCENARIOS.includes(value as ScenarioType);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res: ServerResponse, statusCode: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as JsonRecord;
  } catch (error) {
    throw new Error('请求体必须是合法 JSON');
  }
}

function buildNarrativeInput(body: JsonRecord): NarrativeInput {
  const content = text(body.content);
  if (!content) {
    throw new Error('content 不能为空');
  }

  return {
    childId: text(body.childId, `child_${Date.now()}`),
    childName: text(body.childName, '测试小朋友'),
    classId: text(body.classId, 'class_001'),
    content,
    scenario: isScenarioType(body.scenario) ? body.scenario : 'smart_story_corner',
    timestamp: new Date(),
  };
}

async function persistAssessment(input: NarrativeInput, assessment: NonNullable<ChildPortrait['basePortrait']['assessments'][number]>): Promise<ChildPortrait> {
  let portrait = await system.portraitStorage.loadPortrait(input.childId);
  if (!portrait) {
    portrait = system.portraitEngine.createBasePortrait(
      input.childId,
      input.childName,
      input.classId
    );
  }

  portrait = system.portraitEngine.updatePortrait(portrait, assessment);
  await system.portraitStorage.savePortrait(portrait);
  return portrait;
}

function summarizePortrait(portrait: ChildPortrait): JsonRecord {
  const latestAssessment = portrait.basePortrait.assessments[portrait.basePortrait.assessments.length - 1];

  return {
    childId: portrait.childId,
    name: portrait.name,
    classId: portrait.classId,
    assessmentCount: portrait.basePortrait.assessments.length,
    latestLevel: latestAssessment?.overallLevel ?? null,
    currentRadar: portrait.currentRadar,
  };
}

async function handleApiChildren(): Promise<JsonRecord> {
  const portraits = await system.portraitStorage.loadAllPortraits();
  const children = portraits
    .map(portrait => {
      const latestAssessment = portrait.basePortrait.assessments[portrait.basePortrait.assessments.length - 1];
      return {
        ...summarizePortrait(portrait),
        updatedAt: portrait.basePortrait.updatedAt,
        latestAssessmentAt: latestAssessment?.timestamp ?? null,
      };
    })
    .sort((a, b) => {
      const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt as string).getTime();
      const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt as string).getTime();
      return bTime - aTime;
    });

  return { success: true, children };
}

async function handleAssess(body: JsonRecord): Promise<JsonRecord> {
  const input = buildNarrativeInput(body);
  const assessment = await system.assessmentEngine.assess(input);
  const portrait = await persistAssessment(input, assessment);
  return {
    success: true,
    assessment,
    portrait: summarizePortrait(portrait),
    report: system.portraitEngine.generatePortraitSummary(portrait),
    radarChart: system.radarChart.generateASCII(portrait.currentRadar),
  };
}

async function handleScenario(body: JsonRecord): Promise<JsonRecord> {
  const input = buildNarrativeInput(body);
  const scenario = isScenarioType(body.scenario) ? body.scenario : input.scenario;
  input.scenario = scenario;

  const result = await system.runScenario(scenario, input);
  const portrait = result.portrait || (await system.portraitStorage.loadPortrait(input.childId));

  return {
    success: true,
    scenario,
    assessment: result.assessment,
    portrait: portrait ? summarizePortrait(portrait) : null,
    interactions: result.interactions,
    reflections: [],
    report: portrait ? system.portraitEngine.generatePortraitSummary(portrait) : null,
    radarChart: portrait ? system.radarChart.generateASCII(portrait.currentRadar) : null,
  };
}

async function handlePortrait(childId: string): Promise<JsonRecord> {
  const portrait = await system.portraitStorage.loadPortrait(childId);
  if (!portrait) {
    throw new Error(`未找到幼儿画像: ${childId}`);
  }

  return {
    success: true,
    portrait: summarizePortrait(portrait),
    report: system.portraitEngine.generatePortraitSummary(portrait),
    radarChart: system.radarChart.generateASCII(portrait.currentRadar),
    latestAssessment: portrait.basePortrait.assessments[portrait.basePortrait.assessments.length - 1] || null,
  };
}

async function handleReport(childId: string): Promise<JsonRecord> {
  const portrait = await system.portraitStorage.loadPortrait(childId);
  if (!portrait) {
    throw new Error(`未找到幼儿画像: ${childId}`);
  }

  return {
    success: true,
    childId,
    report: system.portraitEngine.generatePortraitSummary(portrait),
  };
}

async function serveStatic(filePath: string, res: ServerResponse): Promise<boolean> {
  if (!existsSync(filePath)) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
  };

  const body = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(body);
  return true;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    const served = await serveStatic(path.join(PUBLIC_DIR, 'index.html'), res);
    if (!served) sendText(res, 404, 'index.html not found');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/')) {
    const staticFile = path.join(PUBLIC_DIR, pathname.slice(1));
    if (staticFile.startsWith(PUBLIC_DIR) && (await serveStatic(staticFile, res))) {
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      success: true,
      ok: true,
      service: 'doo-multi-agent-web',
      registry: process.env.npm_config_registry || 'https://registry.npmjs.org',
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/children') {
    sendJson(res, 200, await handleApiChildren());
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/portrait/')) {
    const childId = pathname.replace('/api/portrait/', '').trim();
    if (!childId) {
      sendJson(res, 400, { success: false, error: 'childId 不能为空' });
      return;
    }
    try {
      sendJson(res, 200, await handlePortrait(childId));
    } catch (error) {
      sendJson(res, 404, { success: false, error: String(error) });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/report/')) {
    const childId = pathname.replace('/api/report/', '').trim();
    if (!childId) {
      sendJson(res, 400, { success: false, error: 'childId 不能为空' });
      return;
    }
    try {
      sendJson(res, 200, await handleReport(childId));
    } catch (error) {
      sendJson(res, 404, { success: false, error: String(error) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/assess') {
    try {
      sendJson(res, 200, await handleAssess(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 400, { success: false, error: String(error) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/scenario') {
    try {
      sendJson(res, 200, await handleScenario(await readJsonBody(req)));
    } catch (error) {
      sendJson(res, 400, { success: false, error: String(error) });
    }
    return;
  }

  sendJson(res, 404, { success: false, error: 'Not Found' });
}

async function main(): Promise<void> {
  console.warn('⚠️  此为旧版Web服务器（端口3000），建议使用 Express 版本: cd web && npm run server:dev');
  await system.initialize();

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(error => {
      console.error('Web server error:', error);
      sendJson(res, 500, { success: false, error: String(error) });
    });
  });

  server.listen(PORT, () => {
    console.log(`🌐 Web UI running at http://localhost:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      system.destroy();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to start web server:', error);
    process.exit(1);
  });
}

export { main };
