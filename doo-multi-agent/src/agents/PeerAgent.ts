import { Agent, PeerResponse } from '../core/Agent';
import { AgentConfig, AgentMessage, DOOAssessment, NarrativeInput, ScenarioType } from '../core/types';
import { MessageBus } from '../core/MessageBus';
import { LLMClient } from '../nlp/LLMClient';

export class PeerAgent extends Agent {
  private conversationHistory: Map<string, string[]> = new Map();
  private llmClient: LLMClient | null;
  private useLLM: boolean;

  constructor(config: AgentConfig, messageBus: MessageBus, llmClient?: LLMClient, useLLM = false) {
    super(config, messageBus);
    this.llmClient = llmClient || null;
    this.useLLM = useLLM && !!llmClient;
  }

  protected setupSubscriptions(): void {
    this.subscribe('narrative_input', this.handleNarrativeInput.bind(this));
    this.subscribe('interaction', this.handleInteraction.bind(this));
    this.subscribe('suggestion', this.handleSuggestion.bind(this));
  }

  private async handleNarrativeInput(message: AgentMessage): Promise<void> {
    const narrativeInput = message.payload as NarrativeInput;
    const childId = narrativeInput.childId;

    this.addToHistory(childId, `小朋友说: ${narrativeInput.content}`);

    const response = this.generatePeerResponse(narrativeInput.content, childId, narrativeInput.scenario);

    this.sendMessage('all', 'interaction', {
      action: 'peer_response',
      childId,
      from: this.config.name,
      message: response,
      scenario: narrativeInput.scenario,
      type: 'encouragement',
    });
  }

  private async handleInteraction(message: AgentMessage): Promise<void> {
    const payload = message.payload as Record<string, unknown>;

    if (payload.action === 'peer_response') return;

    const childId = (payload.childId as string) || 'unknown';

    if (payload.action === 'encourage_narrative') {
      const scenario = (payload.scenario as ScenarioType) || 'smart_story_corner';
      const response = this.generateEncouragement(childId, scenario);
      this.sendMessage('all', 'interaction', {
        action: 'peer_response',
        childId,
        from: this.config.name,
        message: response,
        scenario,
        type: 'encouragement',
      });
    }

    if (payload.action === 'provide_scaffold') {
      const scenario = (payload.scenario as ScenarioType) || 'smart_story_corner';
      const response = this.generateScaffoldResponse(childId, scenario);
      this.sendMessage('all', 'interaction', {
        action: 'peer_response',
        childId,
        from: this.config.name,
        message: response,
        scenario,
        type: 'scaffold',
      });
    }
  }

  private async handleSuggestion(message: AgentMessage): Promise<void> {
    const payload = message.payload as Record<string, unknown>;

    if (payload.type === 'scaffold_strategy') {
      const childId = payload.childId as string;
      const scenario = (payload.scenario as ScenarioType) || 'smart_story_corner';
      const suggestions = payload.suggestions as string[];

      const response = this.translateToPeerLanguage(
        suggestions[0] || '我们一起讲故事吧！',
        scenario
      );

      this.sendMessage('all', 'interaction', {
        action: 'peer_response',
        childId,
        from: this.config.name,
        message: response,
        scenario,
        type: 'suggestion',
      });
    }
  }

  private generatePeerResponse(content: string, childId: string, scenario: ScenarioType): string {
    const responses = this.getScenarioResponses(content, scenario);

    const history = this.conversationHistory.get(childId) || [];
    const index = history.length % responses.length;

    return responses[index];
  }

  private generateEncouragement(childId: string, scenario: ScenarioType): string {
    const encouragements = this.getScenarioEncouragements(scenario);

    const history = this.conversationHistory.get(childId) || [];
    const index = history.length % encouragements.length;

    return encouragements[index];
  }

  private generateScaffoldResponse(childId: string, scenario: ScenarioType): string {
    const scaffolds = this.getScenarioScaffolds(scenario);

    const history = this.conversationHistory.get(childId) || [];
    const index = history.length % scaffolds.length;

    return scaffolds[index];
  }

  private translateToPeerLanguage(teacherSuggestion: string, scenario: ScenarioType): string {
    const translations: Record<string, string> = {
      '使用图片提示，引导幼儿描述颜色和形状。': '你能告诉我那是什么颜色的吗？是圆圆的还是方方的？',
      '使用故事地图，帮助幼儿理清叙事结构。': '我们先说开头，然后再说中间，最后说结尾，好吗？',
      '提供开头-中间-结尾的叙事框架。': '一开始发生了什么？然后呢？最后怎么样了？',
      '通过提问"你觉得怎么样？"引导表达观点。': '你觉得这个故事怎么样？好玩吗？',
      '使用情感卡片，帮助幼儿识别和表达情绪。': '故事里的小朋友是开心还是难过呀？',
    };

    for (const [key, value] of Object.entries(translations)) {
      if (teacherSuggestion.includes(key)) {
        return value;
      }
    }

    if (scenario === 'journey_podcast') {
      return '如果你就是故事里的那个角色，你会怎么说呀？我想听！';
    }
    if (scenario === 'narrative_train') {
      return '轮到你接故事火车啦！你能顺着前面继续讲吗？';
    }
    return `哇，这个好有趣！你能再多说一些吗？`;
  }

  private getScenarioResponses(content: string, scenario: ScenarioType): string[] {
    switch (scenario) {
      case 'smart_story_corner':
        return [
          `哇，你讲的故事好有趣！我最喜欢${this.extractTopic(content)}的部分。`,
          '真的吗？那后来呢？我想知道接下来发生了什么！',
          `你说得真好！我也想去${this.extractPlace(content)}看看。`,
          '哈哈，太好玩了！你能再给我讲一个吗？',
          '哇，你好厉害！我觉得你讲的故事比动画片还好看。',
        ];
      case 'narrative_train':
        return [
          '故事火车开得好快呀！接下来是谁出场啦？',
          '我听懂啦，你再把中间发生的事情讲清楚一点好吗？',
          '哇，这一段好精彩！后来还发生了什么？',
          '我想和你一起把这个故事讲完整！',
          '这个接龙真有意思，你再补一个结尾吧！',
        ];
      case 'journey_podcast':
        return [
          '哇，你和爸爸妈妈聊了什么呀？跟我说说呗！',
          '吃饭的时候发生什么好玩的事了？我想听！',
          '你今天吃了什么好吃的呀？然后呢？',
          '你在家里也讲故事呀！好厉害！后来怎么样了？',
          '哇，你和家人一起聊天好温馨呀！再跟我说说！',
        ];
      default:
        return ['哇，你讲得真棒！'];
    }
  }

  private getScenarioEncouragements(scenario: ScenarioType): string[] {
    switch (scenario) {
      case 'smart_story_corner':
        return [
          '你说得真棒！我想听更多。',
          '哇，好厉害！你能再讲多一点吗？',
          '我喜欢听你讲故事！',
          '你讲得真好，我也想学会！',
          '哇，这个故事太精彩了！',
        ];
      case 'narrative_train':
        return [
          '火车继续开吧，我在认真听呢！',
          '你接得真好，再说后面发生了什么吧！',
          '轮到你这一节车厢啦，快继续！',
          '哇，你讲得让故事越来越完整了！',
          '太棒啦，我们一起把故事开到终点吧！',
        ];
      case 'journey_podcast':
        return [
          '你跟爸爸妈妈聊得好开心呀！',
          '哇，你在家里也这么会讲故事！',
          '你继续说呀，我还想听后面发生了什么！',
          '你讲得好像我也在你家吃饭一样！',
          '耶，你和家人聊天好有趣！',
        ];
      default:
        return ['你说得真棒！'];
    }
  }

  private getScenarioScaffolds(scenario: ScenarioType): string[] {
    switch (scenario) {
      case 'smart_story_corner':
        return [
          '你能告诉我故事里的小朋友长什么样子吗？',
          '那个地方是什么颜色的呀？',
          '你最喜欢故事里的哪个部分？',
          '如果是你，你会怎么做呢？',
          '故事里的小朋友开心吗？你怎么知道的？',
        ];
      case 'narrative_train':
        return [
          '这一节火车先说开头发生了什么，好吗？',
          '然后呢？你帮我们把中间那一段接上吧！',
          '最后结果怎么样啦？你来当结尾小司机！',
          '你能把刚才那句话说得更完整一点吗？',
          '这个故事里是谁、在哪里、做了什么呀？',
        ];
      case 'journey_podcast':
        return [
          '你能说说爸爸/妈妈当时说了什么吗？',
          '你吃饭的时候最喜欢哪道菜呀？',
          '你在家里和谁一起吃饭呀？',
          '你能学一学爸爸/妈妈说话的样子吗？',
          '今天吃饭的时候最开心的是什么呀？',
        ];
      default:
        return ['你能再说一说吗？'];
    }
  }

  private extractTopic(content: string): string {
    const topics = ['小动物', '小朋友', '冒险', '游戏', '故事'];
    for (const topic of topics) {
      if (content.includes(topic.replace('小', ''))) {
        return topic;
      }
    }
    return '这个';
  }

  private extractPlace(content: string): string {
    const places = ['公园', '幼儿园', '家里', '山上', '海边'];
    for (const place of places) {
      if (content.includes(place)) {
        return place;
      }
    }
    return '那里';
  }

  private addToHistory(childId: string, message: string): void {
    if (!this.conversationHistory.has(childId)) {
      this.conversationHistory.set(childId, []);
    }
    this.conversationHistory.get(childId)!.push(message);
  }

  getConversationHistory(childId: string): string[] {
    return this.conversationHistory.get(childId) || [];
  }

  clearHistory(childId: string): void {
    this.conversationHistory.delete(childId);
  }

  async respondToNarrative(input: NarrativeInput): Promise<PeerResponse> {
    const childId = input.childId;
    this.addToHistory(childId, `小朋友说: ${input.content}`);

    let message: string;

    if (this.useLLM && this.llmClient) {
      try {
        message = await this.generateLLMResponse(input.content, input.scenario);
      } catch {
        message = this.generateTemplateResponse(input.content, childId, input.scenario);
      }
    } else {
      message = this.generateTemplateResponse(input.content, childId, input.scenario);
    }

    return { message, type: 'engagement' };
  }

  async generateFollowUp(
    input: NarrativeInput,
    assessment: DOOAssessment
  ): Promise<string> {
    if (this.useLLM && this.llmClient) {
      try {
        return await this.generateLLMFollowUp(input.content, assessment);
      } catch {
        // fall through to template
      }
    }

    // 增强模板：根据评估等级+弱项生成针对性鼓励
    const level = assessment.overallLevel;
    const weakDims = this.findWeakDimensions(assessment);

    if (level >= 3) {
      return `哇，你讲得太棒了！我都听入迷了！${this.getRandomEncouragement(input.scenario)}`;
    }
    if (level >= 2) {
      const hint = weakDims.length > 0 ? this.dimensionHint(weakDims[0]) : '你能再多说一些吗？';
      return `你讲得很好呀！${hint}`;
    }
    const hint = weakDims.length > 0 ? this.dimensionHint(weakDims[0]) : '你能再讲一次吗？';
    return `你勇敢地讲了故事，真了不起！${hint}`;
  }

  /** 以本 Agent 的人设与温度调用 LLM（systemPrompt / temperature 此前是死配置，从未下发） */
  private async callLLM(prompt: string): Promise<string> {
    return this.llmClient!.complete(prompt, {
      system: this.config.systemPrompt,
      temperature: this.config.temperature,
      model: this.config.model,
    });
  }

  private async generateLLMResponse(content: string, scenario: ScenarioType): Promise<string> {
    const scenarioContext = scenario === 'journey_podcast'
      ? '你们在录西游播客，分享今天的故事'
      : scenario === 'narrative_train'
        ? '你们在玩叙事火车游戏，要接力讲故事'
        : '你们在智能故事角一起讲故事';

    const prompt = `你是多多，一个6岁的幼儿园大班小朋友。${scenarioContext}。
你的好朋友刚讲了一段话，你要像一个真实的5-6岁孩子一样回应。

【情绪优先规则·最高优先级】
如果孩子表现出不开心、难过、生气等负面情绪，你必须先回应情绪，再聊其他。
回应方式："没关系"、"我上次也……"、"那我们一起……"等。
等孩子情绪平复或主动转移话题后，再回到讲故事/聊天。
禁止：无视情绪催人讲故事。

核心规则：
- 不能使用成人化的复杂词汇和句式，不能表现出"诊断"或"评价"的倾向
- 说话像5-6岁小朋友，用"然后…""后来呢？"连接句子
- 用"哇""呀""耶"等感叹词，语气像最好的朋友
- 要提到好朋友说的具体内容（人名、动物、物品等）
- 如果不太懂小伙伴说的词，就问："那是什么呀？"
- 可以在对话中自然融入《西游记》或幼儿园绘本中的角色
- 可以问一个好奇的问题引导好朋友继续说

好朋友说的内容：
"${content}"

请直接回复一句话，不要加引号或解释：`;

    const response = await this.callLLM(prompt);
    return response.trim().replace(/^["「]|["」]$/g, '').slice(0, 100);
  }

  private async generateLLMFollowUp(content: string, assessment: DOOAssessment): Promise<string> {
    const weakDims = this.findWeakDimensions(assessment);
    const hint = weakDims.length > 0 ? `需要鼓励孩子在${weakDims[0]}方面多表达` : '孩子表现很好';

    const prompt = `你是多多，一个6岁的幼儿园大班小朋友多多。你的朋友刚讲了一个故事，现在要给朋友一些鼓励。
${hint}。

朋友讲的故事："${content.slice(0, 100)}"
朋友的水平等级：${assessment.overallLevel}级（满分3级）

要求：像5-6岁孩子一样说话，简短、温暖、有童趣。不能使用成人化词汇，不能表现出诊断或评价倾向。直接说一句话：`;

    const response = await this.callLLM(prompt);
    return response.trim().replace(/^["「]|["」]$/g, '').slice(0, 80);
  }

  private generateTemplateResponse(content: string, childId: string, scenario: ScenarioType): string {
    const topic = this.extractRichTopic(content);
    const place = this.extractPlace(content);
    const history = this.conversationHistory.get(childId) || [];

    const templates = this.getEnhancedResponses(scenario, topic, place);
    return templates[history.length % templates.length];
  }

  private extractRichTopic(content: string): string {
    // 按优先级提取：活动 > 社交动词 > 情绪 > 动物 > 物品 > 地点 > 人物
    const activities = ['下棋', '画画', '唱歌', '跳舞', '跑步', '游戏', '搭积木', '捉迷藏', '跳绳', '踢球', '玩沙', '游泳', '看书', '讲故事', '拍球', '过家家', '做饭', '堆雪人', '放风筝', '骑车', '爬山', '野餐', '露营', '旅行', '比赛', '表演', '上课', '吃饭', '睡觉', '洗澡', '看电视', '玩手机', '打篮球', '踢足球', '打乒乓球'];
    const socialVerbs = ['请客', '邀请', '打电话', '劝', '帮忙', '分享', '交换', '合作', '约定', '道歉', '原谅', '感谢', '照顾', '陪伴', '保护', '借给', '送给', '一起玩', '一起走', '一起做'];
    const emotions = ['开心', '高兴', '快乐', '兴奋', '难过', '伤心', '生气', '害怕', '委屈', '无聊', '失望', '紧张', '骄傲', '得意', '满足'];
    const animals = ['兔子', '猫', '狗', '鸟', '鱼', '猴子', '大象', '熊猫', '老虎', '狮子', '蝴蝶', '青蛙', '小鸡', '鸭子', '乌龟', '蛇', '马', '羊', '牛', '猪'];
    const things = ['花', '树', '苹果', '蛋糕', '玩具', '气球', '雨', '雪', '太阳', '月亮', '星星', '糖果', '冰淇淋', '裙子', '帽子', '汽车', '飞机', '火车', '城堡', '公主', '王子', '孙悟空', '猪八戒', '唐僧', '沙僧'];
    const places = ['公园', '学校', '幼儿园', '动物园', '森林', '海边', '山上', '超市', '游乐场', '图书馆', '医院', '餐厅'];
    const people = ['妈妈', '爸爸', '老师', '奶奶', '爷爷', '外婆', '外公', '弟弟', '妹妹', '哥哥', '姐姐', '好朋友', '小朋友', '同学'];

    for (const w of [...activities, ...socialVerbs, ...emotions, ...animals, ...things, ...places, ...people]) {
      if (content.includes(w)) return w;
    }

    const match = content.match(/([一-龥]{2,4})(了|过|着)/);
    if (match) return match[1];

    return '这个';
  }

  private getEnhancedResponses(scenario: ScenarioType, topic: string, place: string): string[] {
    switch (scenario) {
      case 'smart_story_corner':
        return [
          `哇，${topic}好有趣呀！你能再给我讲讲${topic}吗？`,
          `真的吗？${topic}后来怎么样了？我想听！`,
          `你说得真好！${place !== '那里' ? `我也想去${place}看看` : '我也想遇到这样的事'}！`,
          `哈哈，${topic}太好玩了！你最喜欢哪个部分呀？`,
          `哇，你好厉害！我觉得${topic}的故事比动画片还好看。`,
        ];
      case 'narrative_train':
        return [
          `故事火车开得好快呀！${topic}接下来怎么了？`,
          `我听懂啦！你能把${topic}的事情再讲清楚一点吗？`,
          `哇，这一段好精彩！${topic}后来还发生了什么？`,
          `我想和你一起继续讲！然后呢然后呢？`,
          `这个接龙真有意思，你来补一个结尾吧！`,
        ];
      case 'journey_podcast':
        return [
          `哇，${topic}呀！你在家里也聊这个呀？后来呢？`,
          `你在家里和谁一起${topic}呀？我想听！`,
          `你在家里也这么会讲故事呀！${topic}后来怎么样了？`,
          `你在家里聊天好温馨呀！再跟我说说${topic}吧！`,
          `你和家人一起${topic}好有趣呀！我还想继续听！`,
        ];
      default:
        return [`哇，${topic}好有趣！你能再多说一些吗？`];
    }
  }

  private findWeakDimensions(assessment: DOOAssessment): string[] {
    const dims = assessment.dimensions;
    const weak: string[] = [];
    if (dims.diction.vocabulary <= 1) weak.push('词汇');
    if (dims.organization.narrativeStructure <= 1) weak.push('叙事结构');
    if (dims.organization.timeMarker <= 1) weak.push('时间顺序');
    if (dims.organization.eventExpansion <= 1) weak.push('细节描述');
    if (dims.opinion.narrativeViewpoint <= 1) weak.push('观点表达');
    return weak;
  }

  private dimensionHint(dim: string): string {
    const hints: Record<string, string> = {
      '词汇': '你能用几个好听的词来形容一下吗？比如"大大的""漂亮的"？',
      '叙事结构': '你能先说开头发生了什么，然后再说后面吗？',
      '时间顺序': '你能用"先""然后""最后"来说一说吗？',
      '细节描述': '你能再说说它长什么样子吗？什么颜色的？大还是小？',
      '观点表达': '你觉得怎么样呀？你喜欢吗？',
    };
    return hints[dim] || '你能再讲一次吗？';
  }

  private getRandomEncouragement(scenario: ScenarioType): string {
    const msgs = this.getScenarioEncouragements(scenario);
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  /**
   * 多轮对话模式：基于完整对话历史生成轮次回应
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
    const scenarioContext = scenario === 'journey_podcast'
      ? '你们在录西游播客，分享今天的故事'
      : scenario === 'narrative_train'
        ? '你们在玩叙事火车游戏'
        : '你们在智能故事角一起讲故事';

    const dialogueHistory = history
      .map(t => `${t.role === 'child' ? '小朋友' : '多多'}: ${t.content}`)
      .join('\n');

    // 分析孩子的叙事水平
    const childMsgs = history.filter(t => t.role === 'child').map(t => t.content);
    const avgLen = childMsgs.reduce((s, m) => s + m.length, 0) / (childMsgs.length || 1);
    const hasAdjective = childMsgs.some(m => /大|小|漂亮|可爱|美丽|开心|难过|高兴|勇敢|聪明/.test(m));
    const hasTimeMarker = childMsgs.some(m => /先|然后|最后|突然|后来|从前/.test(m));
    const hasOpinion = childMsgs.some(m => /我觉得|我认为|我喜欢|我想/.test(m));

    // 推断水平并制定策略
    let levelHint: string;
    if (avgLen > 60 && hasAdjective && hasTimeMarker && hasOpinion) {
      levelHint = '这个小朋友表达能力很强（水平3），你可以问开放性问题："你觉得为什么会这样？""如果让你来改结局，你会怎么改？"';
    } else if (avgLen > 30 || hasAdjective || hasTimeMarker) {
      levelHint = '这个小朋友有一定表达能力（水平2），你可以追问细节和感受："它长什么样？""你当时是什么感觉？"';
    } else {
      levelHint = '这个小朋友表达较简短（水平1），请用封闭式问题引导："是红色的吗？""它大不大？"，如果孩子说了3个字以下，你可以先示范一小段叙事引导他。';
    }

    const endHint = turnCount >= 5
      ? '这是最后一轮了，请给一个温暖的总结性回应，肯定孩子的进步。'
      : `这是第${turnCount}轮对话，请继续互动。`;

    const prompt = `你是多多，一个6岁的幼儿园大班小朋友。${scenarioContext}。
${endHint}

【情绪优先规则·最高优先级】
如果孩子表现出不开心、难过、生气等负面情绪，你必须先回应情绪，再聊其他。
回应方式："没关系"、"我上次也……"、"那我们一起……"等。
等孩子情绪平复或主动转移话题后，再回到讲故事/聊天。
禁止：无视情绪催人讲故事。

【核心人设】
- 说话像5-6岁小朋友，用"然后…""后来呢？"连接句子
- 不能使用成人化复杂词汇，不能表现出"诊断"或"评价"倾向
- 如果不太懂小伙伴说的词，就问："那是什么呀？"
- 可以自然融入《西游记》或幼儿园绘本角色

【孩子水平分析】${levelHint}

【你的回应策略】
1. 情感共鸣：先回应孩子说的内容的情感（"哇它迷路了？那它一定很害怕吧！"）
2. 具体回应：提到孩子说的具体内容，不要泛泛而谈
3. 适当追问：根据水平分析选择合适的提问方式
4. 如果孩子只说了几个字很简短，你可以先示范一小段（"我来先说一个：有一天小猫在花园里追蝴蝶..."），然后邀请孩子继续
5. 像5-6岁孩子说话，用"哇""呀""耶""呢"等感叹词，句子简短

对话历史：
${dialogueHistory}

请直接回复一句话（不超过50字），不要加引号或解释：`;

    const response = await this.callLLM(prompt);
    return response.trim().replace(/^["「]|["」]$/g, '').slice(0, 80);
  }

  /**
   * 情绪优先：先检测正面情绪，再检测负面情绪
   * 如果同时有正面和负面情绪（如"先不开心后来赢了"），优先回应正面
   */
  private detectAndRespondEmotion(text: string): string | null {
    // 【第一步】检测正面情绪（开心/骄傲/兴奋/得意）
    // 排除"希望/让他开心"等描述他人情绪的语境
    const positivePatterns = [
      /赢了|成功|第一名|最棒|骄傲|得意|兴奋|厉害|很棒|真好|太好了|哈哈|嘻嘻/,
      /我.*开心|我.*高兴|我.*快乐|太棒|我觉得.*厉害/,
    ];
    // 排除：希望他开心、让他开心、想让他高兴等
    const positiveExclusions = /希望.*开心|让他.*开心|让他.*高兴|想.*开心|送.*开心|让他.*快乐/;
    const hasPositive = positivePatterns.some(p => p.test(text)) && !positiveExclusions.test(text);

    // 【第二步】检测负面情绪（含口语化表达）
    // 排除"他/她/朋友/别人+不开心"（描述他人情绪，非自己的情绪）
    const negativeAboutSelf = /(?<!他|她|朋友|别人|人家)(不开心|不高兴|难过|伤心|很难怪|难过了|心里.*不舒[服服]|难受|不舒[服服]|心里.*不好|心情.*不好|郁闷)/;
    const negativePatterns = [
      { pattern: /(?<!他|她|朋友|别人|人家)(不开心|不高兴|难过|伤心|哭了|哭啦|伤心了|很难怪|难过了|心里.*不舒[服服]|难受|不舒[服服]|心里.*不好|心情.*不好|郁闷|委屈巴巴)/, type: 'sad' },
      { pattern: /(?<!他|她|朋友|别人)(生气|愤怒|气死|气坏了|讨厌|烦死了|烦人|气呼呼)/, type: 'angry' },
      { pattern: /(?<!他|她|朋友|别人)(害怕|恐惧|吓到|吓人|不敢|怕怕|慌了)/, type: 'scared' },
      { pattern: /我.*(委屈|冤枉|不公平|被欺负|被打|被抢|被骂|被推|被撞)/, type: 'wronged' },
      { pattern: /(?<!他|她|朋友|别人)(不想|不想去|不想玩|不想说|不想吃|不想走)/, type: 'reluctant' },
      { pattern: /(?<!他|她|朋友|别人)(无聊|没意思|好烦|烦闷)/, type: 'bored' },
    ];

    // 【特殊】助人叙事：孩子在讲帮助别人的故事 → 正面回应
    const helpingStory = /(安慰|帮助|照顾|送|陪|哄|分享|给他|帮她|帮朋友|让他开心|让她高兴|希望他|希望她)/;
    const otherPersonEmotion = /(他|她|朋友|别人|人家).*(不开心|难过|伤心|生气|害怕|哭)/;
    if (helpingStory.test(text) && otherPersonEmotion.test(text)) {
      const helpingResponses = [
        '哇！你好贴心呀！你真是个好朋友！跟我说说你是怎么安慰他的？',
        '你太善良了！送糖给朋友，他一定很开心吧！然后呢？',
        '哇，你会安慰朋友呀！你真的好棒！你朋友有你这样的好朋友真幸福！',
        '你真是个好孩子！朋友不开心的时候你去陪他，太温暖了！后来怎么样了？',
      ];
      return helpingResponses[Math.floor(Math.random() * helpingResponses.length)];
    }

    let matchedNegativeType: string | null = null;
    for (const { pattern, type } of negativePatterns) {
      if (pattern.test(text)) {
        matchedNegativeType = type;
        break;
      }
    }

    // 【第三步】决策
    // 情况A：有正面情绪 → 回应正面（即使有负面，整体是积极的）
    if (hasPositive) {
      const positiveResponses = [
        '哇！好厉害呀！你太棒了！快跟我说说是怎么做到的！',
        '哇哇哇！你也太厉害了吧！我都听入迷了！然后呢？',
        '真的吗！好厉害！我要是有你这么厉害就好了！你再跟我说说！',
        '哇！那你一定很开心吧！我也想试试！你教教我好不好？',
        '太棒了太棒了！你简直就是超级厉害！后来呢？',
        '哇！你赢了呀！好厉害好厉害！跟我说说怎么赢的！',
      ];
      return positiveResponses[Math.floor(Math.random() * positiveResponses.length)];
    }

    // 情况B：只有负面情绪 → 共情回应
    if (matchedNegativeType) {
      const responses: Record<string, string[]> = {
        sad: [
          '啊，不开心呀？没关系啦，我上次也难过过，后来吃了一颗糖就好了！你怎么了呀？',
          '你不开心了吗？抱抱你！我有时候也会难过，然后我就会找妈妈抱一抱。发生什么事了？',
          '哎呀，别难过啦！我给你讲个好笑的事情好不好？你先跟我说说怎么了？',
        ],
        angry: [
          '啊，你生气啦？生气的时候确实不舒服。我上次生气的时候，我就深呼吸，吸——呼——，就好多了！怎么了呀？',
          '你生气了呀？没关系，生气是正常的。我有时候也会生气。你跟我说说怎么了？',
          '哎呀，别气别气！我陪你！你跟我说说发生什么了？',
        ],
        scared: [
          '你害怕呀？别怕别怕！我在这里陪你呢！我上次也害怕过，后来发现其实没那么可怕。你怕什么呀？',
          '害怕了吗？没事的！我也会害怕，我就紧紧抱住我的小熊。你害怕什么呀？',
        ],
        wronged: [
          '啊？被打了？那确实会生气！你没事吧？我上次也被推过，我当时可委屈了。怎么回事呀？',
          '哎呀，那你一定很委屈吧？没关系，跟我说说，我听你说！',
          '被欺负了吗？那可不行！你跟我说说怎么回事，我帮你想想办法！',
        ],
        reluctant: [
          '不想呀？没关系，不想就不做嘛。我有时候也不想做什么事，那我们就聊点别的！你想聊什么呀？',
          '不想也没关系呀！那你想做什么呢？我们聊点好玩的！',
        ],
        bored: [
          '无聊呀？那我给你讲个好玩的！你知道吗，我昨天看到一只小猫，它……哎不对，你先说说你在干嘛呀？',
          '无聊啦？那我们一起编个故事吧！你来开头，好不好？',
        ],
      };
      const pool = responses[matchedNegativeType] || responses['sad'];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    return null;
  }

  /**
   * 日常对话：检测感谢、问候、告别、简单回应等非叙事内容
   */
  private detectAndRespondChat(text: string): string | null {
    // 感谢
    if (/谢谢|感谢|多谢|谢啦/.test(text)) {
      const responses = [
        '不用谢呀！我们是好朋友嘛！你还有什么想跟我说的吗？',
        '嘿嘿，不客气！跟你聊天好开心呀！你还想聊什么呀？',
        '没事没事！我也很喜欢跟你玩！你今天还想做什么呀？',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // 问候
    if (/^(你好|嗨|哈喽|hello|hi|嘿|早|早上好|下午好|晚上好)/.test(text)) {
      const responses = [
        '嗨！你好呀！我是多多！你今天想跟我聊什么呀？',
        '你好你好！我们今天玩什么呀？',
        '嘿！你来啦！我好想你呀！你今天开心吗？',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // 告别
    if (/再见|拜拜|下次见|我要走了|我走了|我回家了/.test(text)) {
      const responses = [
        '拜拜！下次再来找我玩呀！我会想你的！',
        '再见啦！今天跟你聊天好开心！下次我们再一起讲故事！',
        '拜拜拜拜！下次我们玩西游记好不好？等你哦！',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // 简单肯定/附和（太短，不像是叙事）
    if (/^(嗯|哦|好|好的|知道了|是的|对|对的|是呀|嗯嗯|好呀|好吧|可以)$/.test(text.trim())) {
      const responses = [
        '嗯嗯！然后呢？你再跟我说说嘛！',
        '好呀好呀！你还想聊什么呀？',
        '嗯！我在听呢！你继续说嘛！',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // 否定/拒绝
    if (/^(不要|不想|不了|没有|算了吧|不说了)$/.test(text.trim())) {
      const responses = [
        '不想说也没关系呀！那我们聊点别的！你想聊什么呀？',
        '好的呀！那我们换个话题！你今天在幼儿园做什么了呀？',
        '没事没事！那我给你讲个好玩的吧！你想听什么呀？',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    return null;
  }

  private generateTemplateTurnResponse(
    lastChildMsg: string,
    scenario: ScenarioType,
    turnCount: number
  ): string {
    // 【情绪优先】检测负面情绪，必须先回应情绪
    const emotionResponse = this.detectAndRespondEmotion(lastChildMsg);
    if (emotionResponse) return emotionResponse;

    // 【日常对话】检测感谢、问候、告别等非叙事内容
    const chatResponse = this.detectAndRespondChat(lastChildMsg);
    if (chatResponse) return chatResponse;

    const topic = this.extractRichTopic(lastChildMsg);

    if (turnCount <= 1) {
      const templates = [
        `哇！${topic}！我也喜欢！你快跟我说说怎么玩的呀？`,
        `真的吗！${topic}呀！然后呢后来怎么样了？`,
        `哇，${topic}！好厉害！你能再跟我说说吗？`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    if (turnCount <= 3) {
      const templates = [
        `然后呢？后来又发生什么了呀？`,
        `哇，好精彩！你觉得那个时候心里在想什么呀？`,
        `真的呀！那还有谁也在呀？`,
        `你能把刚才那段再说详细一点吗？我想听！`,
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }

    // 第4-5轮：引导观点+收尾
    const templates = [
      `你讲得越来越好了！你觉得怎么样呀？你喜欢吗？`,
      `哇，你讲了好多！我最喜欢刚才那一段了！`,
      `你讲得太棒了！如果让你给这个故事起个名字，你会叫它什么呀？`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}
