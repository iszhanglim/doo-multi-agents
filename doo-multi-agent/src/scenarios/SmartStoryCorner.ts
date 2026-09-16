import { ScenarioContext, ScenarioResult, NarrativeInput, ScenarioType, DOOAssessment } from '../core/types';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { PortraitEngine } from '../portrait/PortraitEngine';
import { IPortraitStorage } from '../portrait/IPortraitStorage';
import { AssessmentEngine } from '../doo/AssessmentEngine';

export interface StoryCornerConfig {
  storyTheme?: string;
  pictureBook?: string;
  languageGame?: string;
  enableVoice?: boolean;
}

export class SmartStoryCorner {
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

  async run(
    narrativeInput: NarrativeInput,
    config?: StoryCornerConfig
  ): Promise<ScenarioResult> {
    const enrichedInput: NarrativeInput = {
      ...narrativeInput,
      scenario: 'smart_story_corner' as ScenarioType,
      metadata: {
        ...narrativeInput.metadata,
        storyTheme: config?.storyTheme,
        pictureBook: config?.pictureBook,
        languageGame: config?.languageGame,
        enableVoice: config?.enableVoice ?? true,
      },
    };

    const context: ScenarioContext = {
      scenario: 'smart_story_corner',
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

  generateStoryPrompt(theme?: string): string {
    const themes = [
      '小动物冒险',
      '幼儿园的一天',
      '神奇的大树',
      '彩虹色的朋友',
      '月亮上的家',
    ];
    const selectedTheme = theme || themes[Math.floor(Math.random() * themes.length)];

    return `今天我们来聊聊"${selectedTheme}"的故事。你能给我讲一个关于${selectedTheme}的故事吗？`;
  }

  generateLanguageGame(): { name: string; description: string; prompt: string } {
    const games = [
      {
        name: '词语接龙',
        description: '用故事中的词语进行接龙游戏',
        prompt: '我们来做词语接龙吧！我说一个词，你用这个词的最后一个字说一个新词。',
      },
      {
        name: '故事续编',
        description: '续编故事结尾',
        prompt: '故事讲到一半，你觉得接下来会发生什么呢？',
      },
      {
        name: '角色扮演',
        description: '扮演故事中的角色',
        prompt: '如果你是故事里的主人公，你会怎么做？',
      },
      {
        name: '细节描述',
        description: '描述故事中的细节',
        prompt: '故事里的小动物长什么样子？你能描述一下吗？',
      },
    ];

    return games[Math.floor(Math.random() * games.length)];
  }

  generateEncouragementMessage(): string {
    const messages = [
      '你说得真棒！',
      '我喜欢你的故事！',
      '你讲得太有趣了！',
      '哇，你好有想象力！',
      '这个故事真好听！',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  generateReflectionQuestions(): string[] {
    return [
      '你最喜欢自己故事里的哪个部分？',
      '如果让你再讲一次，你会加上什么？',
      '你觉得故事里的小朋友开心吗？',
    ];
  }
}
