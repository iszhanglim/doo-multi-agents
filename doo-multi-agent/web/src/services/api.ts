import type { ChildPortrait, NarrativeInput, AssessmentRunResult } from '../types';

const API_BASE = import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3001/api';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // 健康检查
  health: () => fetchApi<{ status: string; agents: string[] }>('/health'),

  // 评估叙事
  assess: (input: NarrativeInput) =>
    fetchApi<AssessmentRunResult>('/assess', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 运行场景
  runScenario: (type: string, input: NarrativeInput) =>
    fetchApi<{ success: boolean; result: unknown }>(`/scenario/${type}`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 获取幼儿画像
  getPortrait: (childId: string) =>
    fetchApi<{ success: boolean; portrait: ChildPortrait }>(`/portrait/${childId}`),

  // 获取所有画像
  getPortraits: () =>
    fetchApi<{ success: boolean; portraits: ChildPortrait[] }>('/portraits'),

  // 生成雷达图
  getRadar: (childId: string) =>
    fetchApi<{ success: boolean; radar: string }>(`/radar/${childId}`),

  // 生成报告
  getReport: (childId: string) =>
    fetchApi<{ success: boolean; report: string }>(`/report/${childId}`),

  // 获取统计数据
  getStats: () =>
    fetchApi<{ success: boolean; stats: { totalChildren: number; todayCount: number; classCount: number; avgLevel: number } }>('/stats'),

  // 删除幼儿画像
  deletePortrait: (childId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/portrait/${childId}`, {
      method: 'DELETE',
    }),

  // ========== 多轮对话 API ==========

  // 开始对话
  conversationStart: (data: { childName: string; classId?: string; scenario?: string }) =>
    fetchApi<{ success: boolean; sessionId: string; greeting: string; agentName?: string; maxTurns: number }>('/conversation/start', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 对话轮次
  conversationTurn: (data: { sessionId: string; message: string }) =>
    fetchApi<{ success: boolean; peerMessage: string; agentName?: string; turnCount: number; maxTurns: number; suggestEnd: boolean }>('/conversation/turn', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 结束对话
  conversationEnd: (data: { sessionId: string }) =>
    fetchApi<{ success: boolean; turns: unknown[]; childNarrative: string; assessment: AssessmentRunResult['assessment']; portrait: AssessmentRunResult['portrait']; interactions: AssessmentRunResult['interactions']; reflections: string[] }>('/conversation/end', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
