import { Agent, PeerResponse, ScaffoldSuggestion, ReflectionResult } from '../core/Agent';
import { AgentConfig, AgentMessage, DOOAssessment, NarrativeInput, ScenarioType, getScenarioLabel } from '../core/types';
import { MessageBus } from '../core/MessageBus';
import { LLMClient } from '../nlp/LLMClient';
import { LIFE_TIPS, QUESTION_STARTERS, ACTIVITY_LIBRARY, findActivitiesByType, formatActivityCase, getActivityCaseForAssessment, getTrainCaseForAssessment, formatTrainCase } from '../knowledge/TeacherKnowledge';

const ACTIVITY_TIME_LIMIT_MS = 8 * 60 * 1000; // 8分钟健康用屏规则

export class TeacherAgent extends Agent {
  private observationRecords: Map<string, string[]> = new Map();
  private activityStartTime: Map<string, number> = new Map();
  private conversationContext: Map<string, 'child' | 'teacher'> = new Map();
  private llmClient: LLMClient | null = null;
  private useLLM = false;

  constructor(config: AgentConfig, messageBus: MessageBus, llmClient?: LLMClient, useLLM = false) {
    super(config, messageBus);
    this.llmClient = llmClient || null;
    this.useLLM = useLLM && !!llmClient;
  }

  protected setupSubscriptions(): void {
    this.subscribe('narrative_input', this.handleNarrativeInput.bind(this));
    this.subscribe('assessment_result', this.handleAssessmentResult.bind(this));
    this.subscribe('interaction', this.handleInteraction.bind(this));
    this.subscribe('reflection', this.handleReflection.bind(this));
  }

  // ========== 消息处理 ==========

  private async handleNarrativeInput(message: AgentMessage): Promise<void> {
    const narrativeInput = message.payload as NarrativeInput;
    const childId = narrativeInput.childId;

    this.recordActivityStart(childId);
    this.conversationContext.set(childId, 'child');

    const observation = `观察到幼儿${narrativeInput.childName}在${getScenarioLabel(narrativeInput.scenario)}中进行了叙事表达。`;
    this.addObservation(childId, observation);

    this.sendMessage('peer', 'interaction', {
      action: 'encourage_narrative',
      childId,
      childName: narrativeInput.childName,
      scenario: narrativeInput.scenario,
      message: this.generateOpeningPrompt(narrativeInput),
    });
  }

  private async handleAssessmentResult(message: AgentMessage): Promise<void> {
    const payload = message.payload as { assessment?: DOOAssessment };
    if (!payload.assessment) return;

    const assessment = payload.assessment;
    const childId = assessment.childId;

    const observation = `评估结果：${assessment.childName}的整体水平为${assessment.overallLevel}级。`;
    this.addObservation(childId, observation);

    const scaffoldSuggestions = this.generateDOOScaffolds(assessment);
    const teachingNotes = this.generateTeacherReport(assessment);

    this.sendMessage('all', 'suggestion', {
      type: 'teaching_reflection',
      childId,
      scenario: assessment.scenario,
      assessment,
      teachingNotes,
      scaffoldSuggestions,
    });
  }

  private async handleInteraction(message: AgentMessage): Promise<void> {
    const payload = message.payload as Record<string, unknown>;

    if (payload.action === 'request_scaffold') {
      const childId = payload.childId as string;
      const childName = payload.childName as string;
      const scenario = payload.scenario as ScenarioType || 'smart_story_corner';

      // 健康用屏检查
      const timeWarning = this.checkActivityLimit(childId);
      const hint = timeWarning
        ? '⏰ 活动已接近8分钟，建议进入收尾环节。请给幼儿一次简短的回顾提示。'
        : `请根据当前场景给幼儿一个简短（1-2句）的引导问题。`;

      this.sendMessage('peer', 'interaction', {
        action: 'provide_scaffold',
        childId,
        childName,
        scenario,
        scaffoldType: 'prompting',
        message: hint,
      });
    }

    if (payload.action === 'childEmotion') {
      const childId = payload.childId as string;
      const emotionType = payload.emotionType as string;
      const response = this.generateEmotionResponse(emotionType);
      this.sendMessage('peer', 'interaction', {
        action: 'peer_response',
        childId,
        message: response,
        type: 'emotion_support',
      });
    }
  }

  private async handleReflection(message: AgentMessage): Promise<void> {
    const payload = message.payload as Record<string, unknown>;
    const reflections = payload.reflections as string[];
    console.log(`[${this.config.name}] 收到反思记录:`);
    reflections?.forEach(r => console.log(`  - ${r}`));
  }

  // ========== 核心方法 ==========

  /** DOO三维度支架生成 */
  private generateDOOScaffolds(assessment: DOOAssessment): string[] {
    const suggestions: string[] = [];
    const dims = assessment.dimensions;
    const scenario = assessment.scenario;
    const childName = assessment.childName;

    suggestions.push(this.getScenarioScaffold(scenario));

    // D（词句）维度 —— 联系生活、具体形象（5分制：1-3分需支持）
    if (dims.diction.vocabulary <= 3) {
      const tip = LIFE_TIPS.diction.vocabulary[0];
      suggestions.push(`【词句D】${childName}词汇水平${dims.diction.vocabulary}分（初级/中级需提升），建议：${tip}`);
      suggestions.push(`【词句D】玩"找形容词"小游戏（红彤彤的苹果、圆溜溜的皮球），让孩子挑词放进句子里。`);
    }
    if (dims.diction.sentenceStructure <= 3) {
      const tip = LIFE_TIPS.diction.sentenceStructure[1];
      suggestions.push(`【词句D】帮${childName}把短句连起来：${tip}`);
    }

    // O（组织）维度 —— 联系生活、具体形象
    if (dims.organization.narrativeStructure <= 3) {
      suggestions.push(`【组织O】用孩子熟悉的时间线"早上/中午/晚上"帮${childName}理顺序，或讲亲身经历的事（去游乐场、过生日）。`);
    }
    if (dims.organization.themeRelevance <= 3) {
      suggestions.push(`【组织O】讲故事前先约定"只讲去公园的事"，${childName}跑题时用三问拉回：我们讲的是谁？在哪里？发生了什么事？`);
    }
    if (dims.organization.eventExpansion <= 3) {
      suggestions.push(`【组织O】让${childName}当"小记者"追问细节："后来呢？什么颜色？大的还是小的？像什么？"`);
    }
    if (dims.organization.expressiveness <= 3) {
      suggestions.push(`【组织O】让${childName}模仿角色声音和动作："小兔子说话什么样？大灰狼呢？讲到爬就做爬的动作。"`);
    }

    // O（观点）维度 —— 联系生活、具体形象
    if (dims.opinion.narrativeViewpoint <= 3) {
      suggestions.push(`【观点O】多问${childName}"你觉得呢？""你最喜欢谁？为什么？"或用选择问句："谁做得对？是小花还是小蚂蚁？"`);
    }

    if (suggestions.length === 1) {
      suggestions.push(`幼儿${childName}能力发展良好（4-5分，高级），可提高挑战度，鼓励更丰富的细节和角色视角。`);
    }

    return suggestions;
  }

  /** 面向教师的观察报告 */
  private generateTeacherReport(assessment: DOOAssessment): string[] {
    const dims = assessment.dimensions;
    const childName = assessment.childName;
    const scenario = assessment.scenario;

    return [
      `${childName}在${getScenarioLabel(scenario)}中完成了叙事表达，整体水平${assessment.overallLevel}级。` +
      `词句：词汇${dims.diction.vocabulary}级/句型${dims.diction.sentenceStructure}级；` +
      `组织：结构${dims.organization.narrativeStructure}级/主题${dims.organization.themeRelevance}级/扩展${dims.organization.eventExpansion}级/表现${dims.organization.expressiveness}级；` +
      `观点：${dims.opinion.narrativeViewpoint}级。`,

      this.generateProfessionalAdvice(assessment),

      `${this.getNextActivityHint(assessment)}`,
    ];
  }

  /** 生成专业、正式、分点的整体建议（联系生活、具体形象，附提问范例） */
  private generateProfessionalAdvice(assessment: DOOAssessment): string {
    const dims = assessment.dimensions;
    const name = assessment.childName;
    const advice: string[] = [];

    // D 词句维度（5分制：1-3分需支持）
    if (dims.diction.vocabulary <= 3) {
      advice.push('建议通过实物比喻引导幼儿扩充词汇，如引导其运用"像苹果一样红""比大象还大"等具象化表达，丰富形容性词汇。可参考活动《我喜欢的动物》用"猜谜—编谜"的方式描述特征。');
    }
    if (dims.diction.sentenceStructure <= 3) {
      advice.push('建议运用"句子接龙"游戏，帮助幼儿掌握"先…然后…最后…"的句式结构。提问时可引导："你能用先…然后…最后…把这件事说清楚吗？"');
    }

    // O 组织维度
    if (dims.organization.narrativeStructure <= 3) {
      advice.push('建议借助"故事小火车"等具象工具，帮助幼儿建立"开头—中间—结尾"的叙事顺序。可参考《手套》用图标理清角色出场顺序。');
    }
    if (dims.organization.themeRelevance <= 3) {
      advice.push(`建议在讲述前明确主题约定，讲述中运用"人物、地点、事件"三问引导幼儿紧扣主题。可参考《夸父追日》追问："他为什么要这样做？原因到底是什么？"`);
    }
    if (dims.organization.eventExpansion <= 3) {
      advice.push('建议通过"小记者追问"策略，引导幼儿补充关键细节。可提问："除了颜色，还能怎么介绍它？它爱吃什么？爱做什么？"');
    }
    if (dims.organization.expressiveness <= 3) {
      advice.push('建议引导幼儿运用声音、动作、表情丰富讲述，如模仿角色语气。可参考《手套》表演环节，让幼儿模仿小动物的语气语调。');
    }

    // O 观点维度
    if (dims.opinion.narrativeViewpoint <= 3) {
      advice.push('建议通过开放式与选择式提问结合，鼓励幼儿表达看法。可参考《灶王奶奶》："你最喜欢灶王奶奶的哪一点？为什么？"或辩论活动："你同意吗？你的理由是什么？"');
    }

    if (advice.length === 0) {
      advice.push(`幼儿${name}叙事能力发展均衡（4-5分，高级），建议参考《男孩和女孩》《网络生活》等辩论活动，提供更具挑战性的表达任务。`);
    }

    return advice.map(a => `• ${a}`).join('\n');
  }

  /** DOO支架语言（面向幼儿） */
  generateChildPrompt(assessment: DOOAssessment, dimension: 'diction' | 'organization' | 'opinion'): string {
    const dims = assessment.dimensions;
    const name = assessment.childName;

    switch (dimension) {
      case 'diction':
        if (dims.diction.vocabulary <= 3) {
          return `${name}，你刚才说的很好！你说"大"，那还能说说怎么大吗？圆圆的像皮球，还是长长的像蛇？`;
        }
        if (dims.diction.sentenceStructure <= 3) {
          return `${name}，你能用"先……然后……"再说一遍吗？一句一句连起来，就更好听了。`;
        }
        return `${name}说得真棒！你用了好多好听的词，老师很喜欢听你讲故事。`;
      case 'organization':
        if (dims.organization.narrativeStructure <= 3) {
          return `${name}，我们先说什么时候的事，再说在哪里，后来发生了什么？慢慢说，老师听着呢。`;
        }
        if (dims.organization.themeRelevance <= 3) {
          return `${name}，我们讲的这个人是做什么的呀？他又去了哪里呢？我们一直说他，好吗？`;
        }
        if (dims.organization.eventExpansion <= 3) {
          return `后来呢？你看到了什么？听到了什么？再多说一点，老师想知道。`;
        }
        return `${name}讲得真有条理！老师一听就明白了。`;
      case 'opinion':
        if (dims.opinion.narrativeViewpoint <= 3) {
          return `${name}，你觉得呢？你喜欢故事里的谁呀？为什么喜欢他？`;
        }
        return `${name}真有想法！能不能告诉大家，你是怎么想的？`;
    }
  }

  /**
   * 多轮对话模式（叙事火车场景）：小欧老师作为"车厢长"组织叙事接力
   * 基于完整对话历史生成回应，采用DOO支架引导幼儿有条理地讲述
   */
  async generateTurnResponse(
    history: Array<{ role: 'child' | 'peer'; content: string }>,
    scenario: ScenarioType
  ): Promise<{ message: string; suggestEnd: boolean }> {
    const childTurns = history.filter(t => t.role === 'child');
    const turnCount = childTurns.length;
    const lastChildMsg = childTurns[childTurns.length - 1]?.content || '';
    const suggestEnd = turnCount >= 5;

    let message: string;

    if (this.useLLM && this.llmClient) {
      try {
        message = await this.generateLLMTurnResponse(history, scenario, turnCount);
      } catch {
        message = this.generateTemplateTurnResponse(lastChildMsg, scenario, turnCount);
      }
    } else {
      message = this.generateTemplateTurnResponse(lastChildMsg, scenario, turnCount);
    }

    return { message, suggestEnd };
  }

  private async generateLLMTurnResponse(
    history: Array<{ role: 'child' | 'peer'; content: string }>,
    scenario: ScenarioType,
    turnCount: number
  ): Promise<string> {
    const dialogueHistory = history
      .map(t => `${t.role === 'child' ? '小朋友' : '小欧老师'}: ${t.content}`)
      .join('\n');

    const prompt = `你是小欧老师，幼儿园大班叙事活动"叙事火车"的助教老师。你在组织一场叙事接力游戏，孩子们是火车的各节车厢，要按顺序讲一个完整的故事。

你的职责：
1. 维持叙事节奏，引导孩子按"开头—中间—结尾"顺序接力讲述
2. 用DOO支架帮助孩子把话说完整、有条理、有想法
   - D（词句）：引导使用更丰富的词汇和完整句子
   - O（组织）：引导按顺序、说清楚人物地点事件
   - O（观点）：鼓励表达感受、看法和理由
3. 每轮只说1-2句话，不代替孩子说完整故事
4. 孩子说不出来时，先给一个词语或开头示范，再请他接着说
5. 孩子表达情绪时，先接纳情绪再引导叙事
6. 不评价孩子"说得不对"，只使用"还可以这样说"

这是第${turnCount}轮对话，故事火车正在进行中。
${turnCount >= 5 ? '这是最后一轮了，请给小乘客们一个温暖的收尾，肯定大家的合作与进步。' : '请继续引导孩子讲述。'}

对话历史：
${dialogueHistory}

请用温柔、亲切、适合5-6岁孩子的语言，直接回复一句话（不超过50字），不要加引号或解释：`;

    const response = await this.llmClient!.complete(prompt);
    return response.trim().replace(/^["「]|["」]$/g, '').slice(0, 80);
  }

  private generateTemplateTurnResponse(
    lastChildMsg: string,
    scenario: ScenarioType,
    turnCount: number
  ): string {
    // 情绪优先：检测负面情绪
    const emotionResponse = this.generateEmotionResponseFromText(lastChildMsg);
    if (emotionResponse) return emotionResponse;

    if (turnCount <= 1) {
      const templates = [
        '你讲得真好！小火车开得稳稳的。我们先说开头，故事发生在什么时候？在哪里呀？',
        '欢迎你登上故事火车！你是车头，先带大家出发吧——今天的故事发生在哪里？',
        '故事火车要出发啦！你来当第一站，先告诉我们故事里都有谁，好吗？',
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    if (turnCount <= 3) {
      const templates = [
        '接着往前开！然后发生了什么呢？你看到了什么？',
        '故事到这里遇到新朋友了吗？他做了什么？',
        '你讲得越来越精彩了！这件事是怎么发生的呀？',
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    // 第4-5轮：引导观点+收尾
    const templates = [
      '快到终点站啦！你觉得故事里的谁做得最好？为什么呀？',
      '故事要开完了，你最喜欢这个故事里的哪一部分？',
      '我们一起把故事开到终点啦！如果给这个故事起个名字，你会叫它什么？',
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /** 从文本中检测情绪并回应（叙事火车场景用） */
  private generateEmotionResponseFromText(text: string): string | null {
    const sad = /不开心|难过|伤心|委屈|生气|不高兴|害怕/.test(text);
    if (sad) {
      const responses = [
        '老师看到你有点不开心了。没关系，先歇一歇，故事我们可以慢慢讲。你愿意跟老师说说怎么了？',
        '你听起来有点难过。不要紧，小火车等你准备好了再开。你愿意告诉我发生什么了吗？',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    return null;
  }

  /** 情绪接纳回应 */
  generateEmotionResponse(emotionType: string): string {
    const responses: Record<string, string[]> = {
      sad: [
        '老师看到你有点不开心。没关系，每个人都会有不开心的时候。要不要跟老师说说？',
        '你难过了是吗？老师在这里听着，你先深呼吸一下，慢慢说。',
      ],
      angry: [
        '生气的时候心里不舒服。老师知道的。你可以先说说发生了什么，我们一起来想办法。',
        '生气是正常的，每个人都会生气。你先告诉老师怎么了？',
      ],
      scared: [
        '害怕的时候，说出来会好一些。你怕什么呀？老师陪着你。',
        '不用怕，老师在这里。你看到的/听到的是什么？我们一起看看。',
      ],
    };
    const pool = responses[emotionType] || responses['sad'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ========== 辅助方法 ==========

  private recordActivityStart(childId: string): void {
    this.activityStartTime.set(childId, Date.now());
  }

  /** 健康用屏：检查是否超过8分钟 */
  checkActivityLimit(childId: string): boolean {
    const start = this.activityStartTime.get(childId);
    if (!start) return false;
    return (Date.now() - start) > ACTIVITY_TIME_LIMIT_MS;
  }

  getActivityElapsed(childId: string): number {
    const start = this.activityStartTime.get(childId);
    if (!start) return 0;
    return Math.round((Date.now() - start) / 60000);
  }

  private addObservation(childId: string, observation: string): void {
    if (!this.observationRecords.has(childId)) {
      this.observationRecords.set(childId, []);
    }
    this.observationRecords.get(childId)!.push(observation);
  }

  getObservations(childId: string): string[] {
    return this.observationRecords.get(childId) || [];
  }

  setConversationTarget(childId: string, target: 'child' | 'teacher'): void {
    this.conversationContext.set(childId, target);
  }

  // ========== Agent基类方法实现 ==========

  async generateScaffold(
    input: NarrativeInput,
    peerResponse?: PeerResponse | null
  ): Promise<ScaffoldSuggestion> {
    const childId = input.childId;
    this.recordActivityStart(childId);

    const observation = `幼儿${input.childName}在${getScenarioLabel(input.scenario)}中进行了叙事表达，内容${input.content.length}字。`;
    this.addObservation(childId, observation);

    if (peerResponse) {
      this.addObservation(childId, `同伴多多回应：${peerResponse.message}`);
    }

    const elapsed = this.getActivityElapsed(childId);
    const timeNote = elapsed > 7
      ? [`【健康用屏提示】活动已进行${elapsed}分钟，建议尽快进入收尾环节，下次活动不超过8分钟。`]
      : [];

    const suggestions: string[] = [this.getScenarioScaffold(input.scenario)];
    suggestions.push(this.generateOpeningPrompt(input));
    suggestions.push(...timeNote);

    return {
      suggestions,
      teachingNotes: `幼儿本次叙事${input.content.length}字，${input.content.length < 50 ? '内容较短，需要更多引导' : '内容较丰富，可进一步提升'}。`,
    };
  }

  async generateReflection(
    input: NarrativeInput,
    assessment: DOOAssessment
  ): Promise<ReflectionResult> {
    const scaffoldSuggestions = this.generateDOOScaffolds(assessment);
    const teachingNotes = this.generateTeacherReport(assessment);
    const focus = this.getTeacherFocus(assessment);

    const reflections: string[] = [
      `【本次观察】${input.childName}在${getScenarioLabel(input.scenario)}中完成叙事表达，整体水平${assessment.overallLevel}级。`,
      `【DOO分析】${focus}。`,
      ...teachingNotes.slice(0, 2),
    ];

    const followUpPlan = scaffoldSuggestions.slice(0, 3);

    return { reflections, followUpPlan };
  }

  // ========== 内部工具方法 ==========

  private generateOpeningPrompt(narrativeInput: NarrativeInput): string {
    switch (narrativeInput.scenario) {
      case 'smart_story_corner':
        return `${narrativeInput.childName}说得真棒！你能把故事里的样子、声音和心情再讲清楚一点吗？`;
      case 'narrative_train':
        return `轮到你的小火车啦，${narrativeInput.childName}！你能接着讲下去吗？先说说开头发生了什么。`;
      case 'journey_podcast':
        return `我们在录西游播客啦，${narrativeInput.childName}！这个角色做了什么？他心里怎么想的？`;
      default:
        return `${narrativeInput.childName}说得真棒！能再讲多一点吗？`;
    }
  }

  private getScenarioScaffold(scenario: ScenarioType): string {
    switch (scenario) {
      case 'smart_story_corner':
        return '在智能故事角中，幼儿自主选择绘本，助教优先使用图片观察和细节追问（D维度），帮幼儿说得更具体。';
      case 'narrative_train':
        return '在叙事火车中，采用接龙叙事，助教优先使用顺序引导和角色分工（O维度），帮集体叙事连贯。';
      case 'journey_podcast':
        return '在西游播客中，采用角色代入，助教优先使用章节线索和观点追问（O维度·观点），帮幼儿表达角色感受。';
      default:
        return '结合活动情境，提供适时、具体、可执行的支架。';
    }
  }

  private getTeacherFocus(assessment: DOOAssessment): string {
    const dims = assessment.dimensions;
    const focus: string[] = [];

    if (dims.diction.vocabulary <= 3 || dims.diction.sentenceStructure <= 3) {
      focus.push('先扩充词句（D），再鼓励完整表达');
    }
    if (dims.organization.narrativeStructure <= 3 || dims.organization.themeRelevance <= 3) {
      focus.push('帮助幼儿理清故事顺序并紧扣主题（O·组织）');
    }
    if (dims.organization.eventExpansion <= 3 || dims.organization.expressiveness <= 3) {
      focus.push('通过追问和表演增强细节和感染力（O·扩展）');
    }
    if (dims.opinion.narrativeViewpoint <= 3) {
      focus.push('多追问感受与想法，促进观点表达（O·观点）');
    }
    if (focus.length === 0) {
      focus.push('幼儿已达到高级水平（4-5分），可提升挑战度，鼓励更丰富的细节和角色视角');
    }

    return focus.join('；');
  }

  /** 下次活动提示：按叙事活动案例格式返回完整游戏活动案例 */
  private getNextActivityHint(assessment: DOOAssessment): string {
    // 叙事火车场景 → 用教师主持人版叙事火车案例
    if (assessment.scenario === 'narrative_train') {
      const trainCase = getTrainCaseForAssessment(assessment);
      return formatTrainCase(trainCase);
    }
    // 其他场景 → 用通用游戏活动案例
    const activityCase = getActivityCaseForAssessment(assessment);
    return formatActivityCase(activityCase);
  }

  generateClassReport(classId: string, assessments: DOOAssessment[]): string {
    const classAssessments = assessments.filter(a => a.classId === classId);
    if (classAssessments.length === 0) {
      return '该班级暂无评估数据。';
    }

    const avgLevel = classAssessments.reduce((sum, a) => sum + a.overallLevel, 0) / classAssessments.length;
    // 5分制：1-3初级需支持，3-4中级基本达成，4-5高级表现优秀
    const basicCount = classAssessments.filter(a => a.overallLevel < 3).length;
    const midCount = classAssessments.filter(a => a.overallLevel >= 3 && a.overallLevel < 4).length;
    const advancedCount = classAssessments.filter(a => a.overallLevel >= 4).length;

    const report = [
      `【班级叙事能力评估报告】`,
      `评估人数：${classAssessments.length}人`,
      `平均得分：${avgLevel.toFixed(1)}分（满分5分）`,
      ``,
      `水平分布：`,
      `  初级需支持(1-3分)：${basicCount}人`,
      `  中级基本达成(3-4分)：${midCount}人`,
      `  高级表现优秀(4-5分)：${advancedCount}人`,
      ``,
      `教学建议：`,
    ];

    if (basicCount > classAssessments.length * 0.3) {
      report.push('  • 超过30%幼儿处于初级水平，建议加强D（词句）维度的词汇和句型训练。');
    }
    if (advancedCount > classAssessments.length * 0.3) {
      report.push('  • 超过30%幼儿达到高级水平，可提供更具挑战性的叙事任务。');
    }

    report.push('  • 建议采用DOO分层教学，针对不同维度弱项幼儿提供差异化支持。');

    return report.join('\n');
  }
}
