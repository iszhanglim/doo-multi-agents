import { AgentConfig, AgentMessage, AgentType, DOOAssessment, MessageType, NarrativeInput } from './types';
import { MessageBus } from './MessageBus';
import { v4 as uuidv4 } from 'uuid';

export interface PeerResponse {
  message: string;
  type: 'engagement' | 'encouragement' | 'scaffold';
}

export interface ScaffoldSuggestion {
  suggestions: string[];
  teachingNotes: string;
}

export interface ReflectionResult {
  reflections: string[];
  followUpPlan: string[];
}

export abstract class Agent {
  protected config: AgentConfig;
  protected messageBus: MessageBus;
  protected unsubscribeFns: (() => void)[] = [];

  constructor(config: AgentConfig, messageBus: MessageBus) {
    this.config = config;
    this.messageBus = messageBus;
    this.setupSubscriptions();
  }

  get type(): AgentType {
    return this.config.type;
  }

  get name(): string {
    return this.config.name;
  }

  protected abstract setupSubscriptions(): void;

  /** PeerAgent: respond to child's narrative */
  async respondToNarrative(_input: NarrativeInput): Promise<PeerResponse | null> {
    return null;
  }

  /** TeacherAgent: generate scaffold suggestions */
  async generateScaffold(
    _input: NarrativeInput,
    _peerResponse?: PeerResponse | null
  ): Promise<ScaffoldSuggestion | null> {
    return null;
  }

  /** ExpertAgent: assess with multi-agent context */
  async assessWithContext(
    _input: NarrativeInput,
    _peerResponse?: PeerResponse | null,
    _scaffold?: ScaffoldSuggestion | null
  ): Promise<DOOAssessment | null> {
    return null;
  }

  /** TeacherAgent: generate reflection based on assessment */
  async generateReflection(
    _input: NarrativeInput,
    _assessment: DOOAssessment
  ): Promise<ReflectionResult | null> {
    return null;
  }

  /** PeerAgent: generate follow-up encouragement after assessment */
  async generateFollowUp(
    _input: NarrativeInput,
    _assessment: DOOAssessment
  ): Promise<string | null> {
    return null;
  }

  protected sendMessage(
    to: AgentType | 'all',
    type: MessageType,
    payload: unknown
  ): void {
    const message: AgentMessage = {
      id: uuidv4(),
      from: this.config.type,
      to,
      type,
      payload,
      timestamp: new Date(),
    };
    this.messageBus.publish(message);
  }

  protected subscribe(
    messageType: MessageType | 'all',
    handler: (message: AgentMessage) => void | Promise<void>
  ): void {
    const directUnsub = this.messageBus.subscribe(this.config.type, messageType, handler);
    const broadcastUnsub = this.messageBus.subscribe('all', messageType, handler);
    this.unsubscribeFns.push(directUnsub, broadcastUnsub);
  }

  destroy(): void {
    for (const unsub of this.unsubscribeFns) {
      unsub();
    }
    this.unsubscribeFns = [];
  }
}
