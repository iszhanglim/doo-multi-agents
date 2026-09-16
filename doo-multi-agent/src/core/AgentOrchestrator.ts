import { MessageBus } from './MessageBus';
import { Agent, PeerResponse, ScaffoldSuggestion } from './Agent';
import {
  AgentMessage,
  AgentType,
  NarrativeInput,
  DOOAssessment,
  ScenarioContext,
  ScenarioResult,
  ScenarioType,
  getScenarioLabel,
} from './types';

export type OrchestratorPhase = 'interaction' | 'collaboration' | 'application' | 'reflection';

export interface PhaseResult {
  phase: OrchestratorPhase;
  messages: AgentMessage[];
  data: unknown;
}

export class AgentOrchestrator {
  private messageBus: MessageBus;
  private agents: Map<AgentType, Agent> = new Map();
  private phaseListeners: ((phase: OrchestratorPhase, result: PhaseResult) => void)[] = [];

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.type, agent);
  }

  getAgent(type: AgentType): Agent | undefined {
    return this.agents.get(type);
  }

  onPhaseChange(listener: (phase: OrchestratorPhase, result: PhaseResult) => void): () => void {
    this.phaseListeners.push(listener);
    return () => {
      const index = this.phaseListeners.indexOf(listener);
      if (index > -1) {
        this.phaseListeners.splice(index, 1);
      }
    };
  }

  private notifyPhaseChange(phase: OrchestratorPhase, result: PhaseResult): void {
    for (const listener of this.phaseListeners) {
      try {
        listener(phase, result);
      } catch (err) {
        console.error('Phase listener error:', err);
      }
    }
  }

  async runScenario(context: ScenarioContext): Promise<ScenarioResult> {
    const interactions: AgentMessage[] = [];
    const reflections: string[] = [];

    const unsub = this.messageBus.subscribe('all', 'all', (msg: AgentMessage) => {
      interactions.push(msg);
    });

    try {
      // 阶段1 交互：PeerAgent 回应幼儿叙事
      const peerResponse = await this.runInteractionPhase(context);
      this.notifyPhaseChange('interaction', { phase: 'interaction', messages: [], data: peerResponse });

      // 阶段2 协作：TeacherAgent 生成支架建议
      const scaffold = await this.runCollaborationPhase(context, peerResponse);
      this.notifyPhaseChange('collaboration', { phase: 'collaboration', messages: [], data: scaffold });

      // 阶段3 应用：ExpertAgent 基于上下文做评估
      const assessment = await this.runApplicationPhase(context, peerResponse, scaffold);
      this.notifyPhaseChange('application', { phase: 'application', messages: [], data: assessment });

      // 阶段4 反思：TeacherAgent 反思 + PeerAgent 后续鼓励
      const reflectionResult = await this.runReflectionPhase(context, assessment);
      reflections.push(...reflectionResult.reflections);
      this.notifyPhaseChange('reflection', { phase: 'reflection', messages: [], data: reflectionResult });

      return {
        scenario: context.scenario,
        success: true,
        assessment: assessment || undefined,
        interactions,
        reflections,
      };
    } catch (error) {
      console.error('Scenario execution error:', error);
      return {
        scenario: context.scenario,
        success: false,
        interactions,
        reflections: [...reflections, `执行错误: ${error}`],
      };
    } finally {
      unsub();
    }
  }

  private async runInteractionPhase(context: ScenarioContext): Promise<PeerResponse | null> {
    if (!context.narrativeInput) return null;
    const peerAgent = this.agents.get('peer');
    if (!peerAgent) return null;

    this.messageBus.publish({
      id: `interaction_${Date.now()}`,
      from: 'teacher',
      to: 'all',
      type: 'narrative_input',
      payload: context.narrativeInput,
      timestamp: new Date(),
    });

    const response = await peerAgent.respondToNarrative(context.narrativeInput);
    if (response) {
      this.messageBus.publish({
        id: `peer_${Date.now()}`,
        from: 'peer',
        to: 'all',
        type: 'interaction',
        payload: { action: 'peer_response', message: response.message, type: response.type },
        timestamp: new Date(),
      });
    }
    return response;
  }

  private async runCollaborationPhase(
    context: ScenarioContext,
    peerResponse: PeerResponse | null
  ): Promise<ScaffoldSuggestion | null> {
    if (!context.narrativeInput) return null;
    const teacherAgent = this.agents.get('teacher');
    if (!teacherAgent) return null;

    const scaffold = await teacherAgent.generateScaffold(context.narrativeInput, peerResponse);
    // 不再通过消息总线发送（由 assessWithContext → assessment_result → TeacherAgent.handleAssessmentResult 统一输出）
    return scaffold;
  }

  private async runApplicationPhase(
    context: ScenarioContext,
    peerResponse: PeerResponse | null,
    scaffold: ScaffoldSuggestion | null
  ): Promise<DOOAssessment | null> {
    if (!context.narrativeInput) return null;
    const expertAgent = this.agents.get('expert');
    if (!expertAgent) return null;

    // 不通过消息总线触发（防重复），直接调用 assessWithContext
    return expertAgent.assessWithContext(context.narrativeInput, peerResponse, scaffold);
  }

  private async runReflectionPhase(
    context: ScenarioContext,
    assessment: DOOAssessment | null
  ): Promise<{ reflections: string[]; followUp: string | null }> {
    if (!context.narrativeInput || !assessment) {
      return { reflections: this.generateReflectionMessages(context), followUp: null };
    }

    const teacherAgent = this.agents.get('teacher');
    const peerAgent = this.agents.get('peer');

    const [teacherReflection, peerFollowUp] = await Promise.all([
      teacherAgent?.generateReflection(context.narrativeInput, assessment) ?? null,
      peerAgent?.generateFollowUp(context.narrativeInput, assessment) ?? null,
    ]);

    const reflections = teacherReflection?.reflections ?? this.generateReflectionMessages(context);
    const followUp = peerFollowUp;

    if (teacherReflection?.followUpPlan) {
      reflections.push(`后续计划：${teacherReflection.followUpPlan.join('；')}`);
    }
    if (followUp) {
      reflections.push(`多多对小朋友说：${followUp}`);
    }

    this.messageBus.publish({
      id: `reflection_${Date.now()}`,
      from: 'teacher',
      to: 'all',
      type: 'reflection',
      payload: { reflections, scenario: context.scenario },
      timestamp: new Date(),
    });

    return { reflections, followUp };
  }

  private generateReflectionMessages(context: ScenarioContext): string[] {
    const scenarioLabel = getScenarioLabel(context.scenario);
    const input = context.narrativeInput;
    const contentLength = input?.content.trim().length || 0;
    const reflections: string[] = [];

    reflections.push(`本次${scenarioLabel}中，幼儿整体参与积极，愿意围绕主题进行表达。`);

    if (contentLength < 30) {
      reflections.push('本次讲述内容偏短，后续可增加追问和停顿等待，帮助幼儿继续展开。');
    } else if (contentLength < 80) {
      reflections.push('本次讲述已有基本内容，后续可继续引导幼儿补充细节、顺序和感受。');
    } else {
      reflections.push('本次讲述内容较丰富，后续可进一步提升结构完整性和观点表达深度。');
    }

    switch (context.scenario) {
      case 'smart_story_corner':
        reflections.push('智能故事角适合继续使用图片观察和细节提示，支持幼儿独立讲述。');
        break;
      case 'narrative_train':
        reflections.push('叙事火车后续可加强同伴接龙与集体互评，帮助幼儿在群体中保持连贯表达。');
        break;
      case 'journey_podcast':
        reflections.push('西游播客后续可强化角色代入和亲子共讲，让幼儿在家园协同中丰富叙事内容。');
        break;
    }

    reflections.push('多智能体协同中，D博士负责诊断，小欧老师提供支架，多多承担同伴激励，角色分工已形成闭环。');

    return reflections;
  }

  destroy(): void {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
    this.phaseListeners = [];
  }
}
