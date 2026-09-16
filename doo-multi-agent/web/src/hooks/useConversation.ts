import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { DOOAssessment, ChildPortrait, AgentMessage } from '../types';

export interface ChatMessage {
  id: string;
  role: 'child' | 'peer' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationState {
  sessionId: string | null;
  messages: ChatMessage[];
  turnCount: number;
  maxTurns: number;
  loading: boolean;
  error: string | null;
  status: 'idle' | 'chatting' | 'assessing' | 'done';
  agentName: string;
  assessment: DOOAssessment | null;
  portrait: ChildPortrait | null;
  interactions: AgentMessage[];
  reflections: string[];
}

export function useConversation() {
  const [state, setState] = useState<ConversationState>({
    sessionId: null,
    messages: [],
    turnCount: 0,
    maxTurns: 5,
    loading: false,
    error: null,
    status: 'idle',
    agentName: '多多',
    assessment: null,
    portrait: null,
    interactions: [],
    reflections: [],
  });

  const start = useCallback(async (childName: string, classId: string, scenario: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.conversationStart({ childName, classId, scenario });
      setState({
        sessionId: res.sessionId,
        messages: [
          {
            id: 'greeting',
            role: 'peer',
            content: res.greeting,
            timestamp: new Date(),
          },
        ],
        turnCount: 0,
        maxTurns: res.maxTurns,
        loading: false,
        error: null,
        status: 'chatting',
        agentName: res.agentName || '多多',
        assessment: null,
        portrait: null,
        interactions: [],
        reflections: [],
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '创建对话失败',
      }));
    }
  }, []);

  const send = useCallback(async (message: string) => {
    if (!state.sessionId) return;

    // 立即显示孩子的消息
    const childMsg: ChatMessage = {
      id: `child_${Date.now()}`,
      role: 'child',
      content: message,
      timestamp: new Date(),
    };
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, childMsg],
      loading: true,
    }));

    try {
      const res = await api.conversationTurn({ sessionId: state.sessionId, message });
      const peerMsg: ChatMessage = {
        id: `peer_${Date.now()}`,
        role: 'peer',
        content: res.peerMessage,
        timestamp: new Date(),
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, peerMsg],
        turnCount: res.turnCount,
        loading: false,
        agentName: res.agentName || prev.agentName,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '发送失败',
      }));
    }
  }, [state.sessionId]);

  const end = useCallback(async () => {
    if (!state.sessionId) return;

    setState(prev => ({ ...prev, status: 'assessing', loading: true }));
    try {
      const res = await api.conversationEnd({ sessionId: state.sessionId });
      setState(prev => ({
        ...prev,
        status: 'done',
        loading: false,
        assessment: res.assessment || null,
        portrait: res.portrait || null,
        interactions: (res.interactions as AgentMessage[]) || [],
        reflections: res.reflections || [],
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        status: 'chatting',
        error: err instanceof Error ? err.message : '评估失败',
      }));
    }
  }, [state.sessionId]);

  const reset = useCallback(() => {
    setState({
      sessionId: null,
      messages: [],
      turnCount: 0,
      maxTurns: 5,
      loading: false,
      error: null,
      status: 'idle',
      agentName: '多多',
      assessment: null,
      portrait: null,
      interactions: [],
      reflections: [],
    });
  }, []);

  return { ...state, start, send, end, reset };
}
