import { Agent, PeerResponse, ScaffoldSuggestion } from '../core/Agent';
import { AgentConfig, AgentMessage, AgentType, DOOAssessment, NarrativeInput } from '../core/types';
import { MessageBus } from '../core/MessageBus';
import { AssessmentEngine } from '../doo/AssessmentEngine';
import { LLMClient } from '../nlp/LLMClient';
import { generateIndividualReport, generateComparisonReport, generateClassReport as genClassReport } from '../report/IndividualReport';

export class ExpertAgent extends Agent {
  private assessmentEngine: AssessmentEngine;

  constructor(config: AgentConfig, messageBus: MessageBus, llmClient: LLMClient, useLLM = true) {
    super(config, messageBus);
    this.assessmentEngine = new AssessmentEngine(llmClient, useLLM);
  }

  protected setupSubscriptions(): void {
    this.subscribe('assessment_request', this.handleAssessmentRequest.bind(this));
    this.subscribe('narrative_input', this.handleNarrativeInput.bind(this));
  }

  private async handleAssessmentRequest(message: AgentMessage): Promise<void> {
    const payload = message.payload as { narrativeInput?: NarrativeInput };
    if (!payload.narrativeInput) return;

    try {
      const assessment = await this.assessmentEngine.assess(payload.narrativeInput);

      // 不发送 assessment_result（由 assessWithContext 统一发送）
      this.sendMessage('teacher', 'suggestion', {
        type: 'expert_suggestions',
        assessment,
        suggestions: assessment.suggestions,
      });
    } catch (error) {
      console.error('Expert assessment error:', error);
      this.sendMessage('teacher', 'suggestion', {
        type: 'assessment_error',
        error: String(error),
      });
    }
  }

  private async handleNarrativeInput(message: AgentMessage): Promise<void> {
    const narrativeInput = message.payload as NarrativeInput;

    try {
      // 只记录，不评估（由 assessWithContext 统一评估）
      console.log(`[${this.config.name}] 收到叙事输入: ${narrativeInput.childName}`);
    } catch (error) {
      console.error('Expert narrative input error:', error);
    }
  }

  async assessWithContext(
    input: NarrativeInput,
    peerResponse?: PeerResponse | null,
    scaffold?: ScaffoldSuggestion | null
  ): Promise<DOOAssessment> {
    const assessment = await this.assessmentEngine.assess(input);

    if (scaffold?.suggestions) {
      const contextNote = `（小欧老师支架：${scaffold.suggestions[0]}）`;
      if (!assessment.suggestions.some(s => s.includes('小欧老师'))) {
        assessment.suggestions.push(contextNote);
      }
    }

    this.sendMessage('all', 'assessment_result', {
      assessment,
      expert: this.config.name,
      peerContext: peerResponse?.message,
      scaffoldContext: scaffold?.suggestions?.[0],
      timestamp: new Date(),
    });

    return assessment;
  }

  async generatePersonalizedPlan(assessment: DOOAssessment): Promise<string[]> {
    const plan: string[] = [];
    const dims = assessment.dimensions;

    // 5分制：1-3分需支持，4-5分表现良好
    if (dims.diction.vocabulary < 3) {
      plan.push('【词汇水平】做什么：扩充描述性词汇。怎么做：用主题词卡玩"词语热身"，出示5-8张主题图片，教师补充描述。举例："这是蝴蝶，它有一双漂亮的翅膀。"');
    } else if (dims.diction.vocabulary < 4) {
      plan.push('【词汇水平】做什么：提升词汇的丰富度。怎么做：用三格组句图做比喻挑战。举例："月亮像小船""云像棉花糖"。');
    }
    if (dims.diction.sentenceStructure < 3) {
      plan.push('【句子结构】做什么：学习使用连接词连句。怎么做：用三格组句图加入"和、但是、因为、所以"把两句连成一句。举例："我喜欢夏天，并且喜欢秋天。"');
    } else if (dims.diction.sentenceStructure < 4) {
      plan.push('【句子结构】做什么：挑战多种句式。怎么做：用"句式超市"练习"因为…所以…""如果…就…"，并用四种语气各说一次。');
    }
    if (dims.organization.narrativeStructure < 3) {
      plan.push('【叙事结构】做什么：建立故事结构意识。怎么做：用故事火车地图指出车头（开头）、车厢（经过）、车尾（结尾）。举例："我们先说什么时候的事，再说在哪里，后来发生了什么。"');
    }
    if (dims.organization.themeRelevance < 3) {
      plan.push('【主题贴切】做什么：围绕主题讲述。怎么做：用故事火车地图主题栏明确主题，跑题时温柔拉回。举例："我们讲的是谁？在哪里？发生了什么事？"');
    }
    if (dims.organization.eventExpansion < 3) {
      plan.push('【事件扩展】做什么：补充细节。怎么做：用五感提问（看到什么？听到什么？摸到什么？），做"一句变三句"。举例："小猫跑了"→"跑得很快，尾巴翘得高高的，还回头看了我一眼"。');
    }
    if (dims.opinion.narrativeViewpoint < 3) {
      plan.push('【叙事观点】做什么：表达个人观点。怎么做：用情绪观点卡练习观点句开头。举例："我觉得……""我喜欢……""如果是我会……"。');
    } else if (dims.opinion.narrativeViewpoint < 4) {
      plan.push('【叙事观点】做什么：观点+理由。怎么做：用理由卡追问"为什么"。举例："我最喜欢小兔子，因为它帮助了朋友。"');
    }
    if (dims.organization.expressiveness < 3) {
      plan.push('【表现性】做什么：让讲述更生动。怎么做：模仿角色声音、加动作表情。举例："小兔子说话细细的，大灰狼说话粗粗的。"');
    }

    if (plan.length === 0) {
      plan.push('幼儿叙事能力表现良好（4-5分），建议挑战更复杂的叙事任务：做"观点辩论""如果我来改"改编结局，或录制"个人故事集"。');
    }

    return plan;
  }

  /**
   * 生成个体评估报告（依据《个体报告模板》6部分结构）
   */
  generateIndividualReport(input: NarrativeInput, assessment: DOOAssessment) {
    return generateIndividualReport(input, assessment);
  }

  /**
   * 生成前后对比评估报告
   */
  generateComparisonReport(before: DOOAssessment, after: DOOAssessment): string {
    return generateComparisonReport(before, after);
  }

  /**
   * 生成班级画像群报告
   */
  generateClassPortraitReport(className: string, assessments: DOOAssessment[]): string {
    return genClassReport(className, assessments);
  }

  generateMetaAssessment(assessments: DOOAssessment[]): {
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  } {
    if (assessments.length < 2) {
      return {
        trend: 'stable',
        recommendation: '数据不足，建议继续观察和评估。',
      };
    }

    const sorted = [...assessments].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstAvg = this.calculateAverage(first.dimensions);
    const lastAvg = this.calculateAverage(last.dimensions);

    let trend: 'improving' | 'stable' | 'declining';
    if (lastAvg > firstAvg + 0.3) {
      trend = 'improving';
    } else if (lastAvg < firstAvg - 0.3) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    const recommendation = this.generateRecommendation(trend, last.dimensions);

    return { trend, recommendation };
  }

  private calculateAverage(dimensions: DOOAssessment['dimensions']): number {
    const scores = [
      dimensions.diction.vocabulary,
      dimensions.diction.sentenceStructure,
      dimensions.organization.narrativeStructure,
      dimensions.organization.themeRelevance,
      dimensions.organization.eventExpansion,
      dimensions.organization.expressiveness,
      dimensions.opinion.narrativeViewpoint,
    ];
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  private generateRecommendation(
    trend: 'improving' | 'stable' | 'declining',
    dimensions: DOOAssessment['dimensions']
  ): string {
    switch (trend) {
      case 'improving':
        return '幼儿叙事能力呈上升趋势，建议保持当前培养策略并适当增加挑战。';
      case 'declining':
        return '幼儿叙事能力出现波动，建议关注其情绪状态，调整活动难度和兴趣点。';
      case 'stable':
      default: {
        const weakAreas: string[] = [];
        if (dimensions.diction.vocabulary < 3) weakAreas.push('词汇');
        if (dimensions.organization.narrativeStructure < 3) weakAreas.push('叙事结构');
        if (dimensions.opinion.narrativeViewpoint < 3) weakAreas.push('观点表达');

        if (weakAreas.length > 0) {
          return `能力发展平稳，建议重点加强${weakAreas.join('、')}方面的训练（5分制中低于3分需支持）。`;
        }
        return '能力发展稳定，建议拓展叙事主题和情境，保持学习兴趣。';
      }
    }
  }
}
