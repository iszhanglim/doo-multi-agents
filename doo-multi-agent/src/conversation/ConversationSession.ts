import { NarrativeInput, ScenarioType, DOOAssessment, ChildPortrait } from '../core/types';

export interface ConversationTurn {
  role: 'child' | 'peer';
  content: string;
  timestamp: Date;
}

export interface ConversationSession {
  sessionId: string;
  childId: string;
  childName: string;
  classId: string;
  scenario: ScenarioType;
  turns: ConversationTurn[];
  createdAt: Date;
  status: 'active' | 'assessed';
  assessment?: DOOAssessment;
  portrait?: ChildPortrait;
}

// 内存会话存储
const sessions = new Map<string, ConversationSession>();

const MAX_TURNS = 5;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function createSession(
  childName: string,
  classId: string,
  scenario: ScenarioType
): ConversationSession {
  const sessionId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // 由姓名+班级生成稳定ID，保证同一幼儿多轮对话的评估累积到同一画像
  const safeName = childName.trim().replace(/[\s/\\]+/g, '_');
  const safeClass = (classId || 'class_001').trim().replace(/[\s/\\]+/g, '_');
  const childId = `child_${safeClass}_${safeName}`;

  const session: ConversationSession = {
    sessionId,
    childId,
    childName,
    classId,
    scenario,
    turns: [],
    createdAt: new Date(),
    status: 'active',
  };

  sessions.set(sessionId, session);
  cleanExpiredSessions();
  return session;
}

export function getSession(sessionId: string): ConversationSession | undefined {
  return sessions.get(sessionId);
}

export function addTurn(
  sessionId: string,
  role: 'child' | 'peer',
  content: string
): ConversationTurn | undefined {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'active') return undefined;

  const turn: ConversationTurn = { role, content, timestamp: new Date() };
  session.turns.push(turn);
  return turn;
}

export function buildNarrativeInput(session: ConversationSession): NarrativeInput {
  // 将所有孩子的发言拼接成完整叙事内容
  const childContent = session.turns
    .filter(t => t.role === 'child')
    .map(t => t.content)
    .join('。');

  return {
    childId: session.childId,
    childName: session.childName,
    classId: session.classId,
    content: childContent,
    scenario: session.scenario,
    timestamp: new Date(),
  };
}

export function getChildTurnCount(session: ConversationSession): number {
  return session.turns.filter(t => t.role === 'child').length;
}

export function shouldSuggestEnd(session: ConversationSession): boolean {
  return getChildTurnCount(session) >= MAX_TURNS;
}

export function markAssessed(
  sessionId: string,
  assessment: DOOAssessment,
  portrait: ChildPortrait
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = 'assessed';
    session.assessment = assessment;
    session.portrait = portrait;
  }
}

/** 评估结果已被调用方取走后释放会话，避免长期驻留内存 */
export function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// 定期清理过期会话（即使没有新会话创建也能回收内存）
setInterval(() => {
  cleanExpiredSessions();
}, 10 * 60 * 1000).unref();

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}
