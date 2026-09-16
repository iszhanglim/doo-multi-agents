import { ScenarioContext, ScenarioResult, NarrativeInput, ScenarioType, DOOAssessment } from '../core/types';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { PortraitEngine } from '../portrait/PortraitEngine';
import { IPortraitStorage } from '../portrait/IPortraitStorage';
import { AssessmentEngine } from '../doo/AssessmentEngine';
import { v4 as uuidv4 } from 'uuid';

export interface NarrativeTrainConfig {
  groupSize?: number;
  gameType?: 'word_chain' | 'story_chain' | 'picture_story' | 'role_play';
  theme?: string;
  duration?: number; // minutes
}

export interface GroupActivity {
  groupId: string;
  members: string[];
  narrativeInputs: NarrativeInput[];
  assessments: DOOAssessment[];
}

export class NarrativeTrain {
  private orchestrator: AgentOrchestrator;
  private portraitEngine: PortraitEngine;
  private storage: IPortraitStorage;
  private assessmentEngine: AssessmentEngine;

  constructor(
    orchestrator: AgentOrchestrator,
    portraitEngine: PortraitEngine,
    storage: IPortraitStorage,
    assessmentEngine: AssessmentEngine
  ) {
    this.orchestrator = orchestrator;
    this.portraitEngine = portraitEngine;
    this.storage = storage;
    this.assessmentEngine = assessmentEngine;
  }

  /**
   * 单幼儿叙事火车评估（对话模式结束用）：
   * 通过 orchestrator 跑完整多智能体流程，收集 interactions 与小欧老师报告
   */
  async run(
    narrativeInput: NarrativeInput,
    config?: NarrativeTrainConfig
  ): Promise<ScenarioResult> {
    const enrichedInput: NarrativeInput = {
      ...narrativeInput,
      scenario: 'narrative_train' as ScenarioType,
      metadata: {
        ...narrativeInput.metadata,
        gameType: config?.gameType,
        theme: config?.theme,
      },
    };

    const context: ScenarioContext = {
      scenario: 'narrative_train',
      childId: enrichedInput.childId,
      classId: enrichedInput.classId,
      narrativeInput: enrichedInput,
    };

    const result = await this.orchestrator.runScenario(context);

    let assessment: DOOAssessment | undefined = result.assessment;
    if (!assessment) {
      assessment = await this.assessmentEngine.assess(enrichedInput);
      result.assessment = assessment;
    }

    if (assessment) {
      let portrait = await this.storage.loadPortrait(enrichedInput.childId);
      if (!portrait) {
        portrait = this.portraitEngine.createBasePortrait(
          enrichedInput.childId,
          enrichedInput.childName,
          enrichedInput.classId
        );
      }
      portrait = this.portraitEngine.updatePortrait(portrait, assessment);
      await this.storage.savePortrait(portrait);
      result.portrait = portrait;
    }

    return result;
  }

  async runClassActivity(
    classId: string,
    narrativeInputs: NarrativeInput[],
    config?: NarrativeTrainConfig
  ): Promise<{
    groupResults: GroupActivity[];
    classAssessment: {
      averageLevel: number;
      levelDistribution: Record<number, number>;
      suggestions: string[];
    };
    scenarioResult: ScenarioResult;
  }> {
    // 1. 诊断班级群体叙事能力
    const classAssessment = await this.assessClassLevel(classId, narrativeInputs);

    // 2. 分组进行叙事游戏
    const groups = this.formGroups(narrativeInputs, config?.groupSize || 4);
    const groupResults: GroupActivity[] = [];

    for (const group of groups) {
      const groupActivity = await this.runGroupActivity(group, config);
      groupResults.push(groupActivity);
    }

    // 3. 集体拓展词句
    const vocabularyExpansion = this.generateVocabularyExpansion(groupResults);

    // 4. 更新画像 — reuse assessments from group activities
    for (const groupResult of groupResults) {
      for (let i = 0; i < groupResult.narrativeInputs.length; i++) {
        const input = groupResult.narrativeInputs[i];
        const assessment = groupResult.assessments[i];
        if (!assessment) continue;

        let portrait = await this.storage.loadPortrait(input.childId);
        if (!portrait) {
          portrait = this.portraitEngine.createBasePortrait(
            input.childId,
            input.childName,
            input.classId
          );
        }
        portrait = this.portraitEngine.updatePortrait(portrait, assessment);
        await this.storage.savePortrait(portrait);
      }
    }

    // 5. 生成班级场景结果
    const context: ScenarioContext = {
      scenario: 'narrative_train',
      classId,
    };

    const scenarioResult = await this.orchestrator.runScenario(context);

    return {
      groupResults,
      classAssessment,
      scenarioResult,
    };
  }

  private async assessClassLevel(
    classId: string,
    inputs: NarrativeInput[]
  ): Promise<{
    averageLevel: number;
    levelDistribution: Record<number, number>;
    suggestions: string[];
  }> {
    const assessments: DOOAssessment[] = [];
    for (const input of inputs) {
      try {
        const assessment = await this.assessmentEngine.assess(input);
        assessments.push(assessment);
      } catch (error) {
        console.error(`Assessment failed for ${input.childId}:`, error);
      }
    }

    const averageLevel =
      assessments.length > 0
        ? assessments.reduce((sum, a) => sum + a.overallLevel, 0) / assessments.length
        : 0;

    const levelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const assessment of assessments) {
      levelDistribution[assessment.overallLevel]++;
    }

    const suggestions: string[] = [];
    if (levelDistribution[1] > assessments.length * 0.3) {
      suggestions.push('班级中超过30%幼儿处于基础水平，建议加强词汇和句型训练。');
    }
    if (levelDistribution[3] > assessments.length * 0.3) {
      suggestions.push('班级中超过30%幼儿达到优秀水平，可提供更具挑战性的叙事任务。');
    }
    suggestions.push('建议采用分层教学，针对不同水平幼儿提供差异化支持。');

    return {
      averageLevel: Math.round(averageLevel * 100) / 100,
      levelDistribution,
      suggestions,
    };
  }

  private formGroups(
    inputs: NarrativeInput[],
    groupSize: number
  ): NarrativeInput[][] {
    const groups: NarrativeInput[][] = [];
    for (let i = 0; i < inputs.length; i += groupSize) {
      groups.push(inputs.slice(i, i + groupSize));
    }
    return groups;
  }

  private async runGroupActivity(
    groupInputs: NarrativeInput[],
    config?: NarrativeTrainConfig
  ): Promise<GroupActivity> {
    const groupId = `group_${uuidv4()}`;
    const assessments: DOOAssessment[] = [];

    for (const input of groupInputs) {
      try {
        const assessment = await this.assessmentEngine.assess(input);
        assessments.push(assessment);
      } catch (error) {
        console.error(`Group assessment failed for ${input.childId}:`, error);
      }
    }

    return {
      groupId,
      members: groupInputs.map(i => i.childId),
      narrativeInputs: groupInputs,
      assessments,
    };
  }

  private generateVocabularyExpansion(
    groupResults: GroupActivity[]
  ): { word: string; context: string; level: string }[] {
    const expansions = [
      { word: '兴高采烈', context: '形容非常高兴的样子', level: 'advanced' },
      { word: '小心翼翼', context: '形容做事非常谨慎', level: 'advanced' },
      { word: '五颜六色', context: '形容颜色很多', level: 'basic' },
      { word: '闪闪发光', context: '形容光亮闪烁', level: 'basic' },
      { word: '迫不及待', context: '形容非常急切', level: 'advanced' },
      { word: '恍然大悟', context: '形容突然明白', level: 'advanced' },
    ];

    return expansions;
  }

  generateGameInstructions(gameType?: string): {
    title: string;
    steps: string[];
    tips: string[];
  } {
    const games: Record<string, { title: string; steps: string[]; tips: string[] }> = {
      word_chain: {
        title: '词语接龙火车',
        steps: [
          '第一个小朋友说一个词',
          '下一个小朋友用这个词的最后一个字说新词',
          '依次接龙，看火车能开多长',
          '说不出的乘客要"下车"',
        ],
        tips: ['鼓励使用形容词', '可以限定主题', '允许使用同音字'],
      },
      story_chain: {
        title: '故事接龙火车',
        steps: [
          '第一个小朋友讲故事开头',
          '每个人接着讲一段',
          '最后一个小朋友讲结尾',
          '一起给故事起个名字',
        ],
        tips: ['提醒注意故事连贯性', '鼓励添加细节', '允许创意发挥'],
      },
      picture_story: {
        title: '看图讲故事',
        steps: [
          '展示一张有趣的图片',
          '每个小朋友描述看到的内容',
          '把大家的描述连成一个故事',
          '讨论故事的合理性',
        ],
        tips: ['引导观察细节', '鼓励使用形容词', '帮助组织语言'],
      },
      role_play: {
        title: '角色扮演故事',
        steps: [
          '分配故事角色',
          '每个小朋友扮演一个角色',
          '根据场景进行对话',
          '共同完成一个故事',
        ],
        tips: ['提供角色卡片', '鼓励即兴发挥', '注意轮流发言'],
      },
    };

    return games[gameType || 'story_chain'] || games['story_chain'];
  }

  generatePeerEvaluationForm(): {
    questions: { id: string; text: string; options: string[] }[];
  } {
    return {
      questions: [
        {
          id: 'content',
          text: '你觉得同伴的故事内容有趣吗？',
          options: ['非常有趣', '比较有趣', '一般', '不太有趣'],
        },
        {
          id: 'expression',
          text: '同伴讲得清楚吗？',
          options: ['非常清楚', '比较清楚', '一般', '不太清楚'],
        },
        {
          id: 'detail',
          text: '故事里有足够的细节吗？',
          options: ['很多细节', '有一些', '一般', '缺少细节'],
        },
        {
          id: 'favorite',
          text: '你最喜欢故事的哪个部分？',
          options: ['开头', '中间', '结尾', '都喜欢'],
        },
      ],
    };
  }
}
