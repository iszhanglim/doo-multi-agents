import { ScenarioContext, ScenarioResult, NarrativeInput, ScenarioType } from '../core/types';
import { AgentOrchestrator } from '../core/AgentOrchestrator';
import { PortraitEngine } from '../portrait/PortraitEngine';
import { IPortraitStorage } from '../portrait/IPortraitStorage';
import { v4 as uuidv4 } from 'uuid';

export interface JourneyPodcastConfig {
  chapter?: string;
  character?: string;
  activityType?: 'narrative_drawing' | 'character_swap' | 'family_discussion' | 'podcast_recording';
  enableFamilyMode?: boolean;
}

export interface PodcastEpisode {
  episodeId: string;
  childId: string;
  childName: string;
  title: string;
  content: string;
  chapter: string;
  character: string;
  drawings?: string[];
  familyNotes?: string;
  createdAt: Date;
}

export class JourneyPodcast {
  private orchestrator: AgentOrchestrator;
  private portraitEngine: PortraitEngine;
  private storage: IPortraitStorage;
  private episodes: Map<string, PodcastEpisode[]> = new Map();

  constructor(
    orchestrator: AgentOrchestrator,
    portraitEngine: PortraitEngine,
    storage: IPortraitStorage
  ) {
    this.orchestrator = orchestrator;
    this.portraitEngine = portraitEngine;
    this.storage = storage;
  }

  async run(
    narrativeInput: NarrativeInput,
    config?: JourneyPodcastConfig
  ): Promise<ScenarioResult> {
    const enrichedInput: NarrativeInput = {
      ...narrativeInput,
      scenario: 'journey_podcast' as ScenarioType,
      metadata: {
        ...narrativeInput.metadata,
        chapter: config?.chapter,
        character: config?.character,
        activityType: config?.activityType,
        enableFamilyMode: config?.enableFamilyMode ?? true,
      },
    };

    const context: ScenarioContext = {
      scenario: 'journey_podcast',
      childId: enrichedInput.childId,
      classId: enrichedInput.classId,
      narrativeInput: enrichedInput,
    };

    const result = await this.orchestrator.runScenario(context);

    if (result.assessment) {
      let portrait = await this.storage.loadPortrait(enrichedInput.childId);
      if (!portrait) {
        portrait = this.portraitEngine.createBasePortrait(
          enrichedInput.childId,
          enrichedInput.childName,
          enrichedInput.classId
        );
      }
      portrait = this.portraitEngine.updatePortrait(portrait, result.assessment);
      await this.storage.savePortrait(portrait);
      result.portrait = portrait;
    }

    return result;
  }

  createEpisode(
    childId: string,
    childName: string,
    title: string,
    content: string,
    chapter: string,
    character: string,
    familyNotes?: string
  ): PodcastEpisode {
    const episode: PodcastEpisode = {
      episodeId: `episode_${uuidv4()}`,
      childId,
      childName,
      title,
      content,
      chapter,
      character,
      familyNotes,
      createdAt: new Date(),
    };

    if (!this.episodes.has(childId)) {
      this.episodes.set(childId, []);
    }
    this.episodes.get(childId)!.push(episode);

    return episode;
  }

  getEpisodes(childId: string): PodcastEpisode[] {
    return this.episodes.get(childId) || [];
  }

  getClassEpisodes(classId: string): PodcastEpisode[] {
    const allEpisodes: PodcastEpisode[] = [];
    for (const episodes of this.episodes.values()) {
      allEpisodes.push(...episodes);
    }
    return allEpisodes;
  }

  generateChapterGuide(chapter?: string): {
    title: string;
    summary: string;
    characters: string[];
    narrativeStructure: string[];
    discussionQuestions: string[];
  } {
    const chapters: Record<string, {
      title: string;
      summary: string;
      characters: string[];
      narrativeStructure: string[];
      discussionQuestions: string[];
    }> = {
      'birth': {
        title: '石猴出世',
        summary: '东胜神洲傲来国花果山上一块仙石孕育出一只石猴',
        characters: ['石猴', '众猴', '玉皇大帝'],
        narrativeStructure: ['仙石孕育', '石猴出世', '发现水帘洞', '被拥为美猴王'],
        discussionQuestions: [
          '石猴是怎么出生的？',
          '为什么众猴要拜石猴为王？',
          '如果你发现了水帘洞，你会怎么做？',
        ],
      },
      'learning': {
        title: '拜师学艺',
        summary: '美猴王渡海拜师，学得不老长生之术',
        characters: ['美猴王', '菩提祖师', '师兄们'],
        narrativeStructure: ['渡海寻师', '拜师学艺', '得名孙悟空', '学成归来'],
        discussionQuestions: [
          '孙悟空为什么要去学艺？',
          '菩提祖师教了孙悟空什么本领？',
          '你觉得学习新本领重要吗？',
        ],
      },
      'havoc': {
        title: '大闹天宫',
        summary: '孙悟空大闹天宫，被如来佛祖压在五行山下',
        characters: ['孙悟空', '玉皇大帝', '如来佛祖', '二郎神'],
        narrativeStructure: ['官封弼马温', '自封齐天大圣', '大闹蟠桃会', '被压五行山'],
        discussionQuestions: [
          '孙悟空为什么要大闹天宫？',
          '你觉得孙悟空做得对吗？',
          '如果你是玉皇大帝，你会怎么处理？',
        ],
      },
      'journey': {
        title: '西天取经',
        summary: '唐僧师徒四人西天取经，历经九九八十一难',
        characters: ['唐僧', '孙悟空', '猪八戒', '沙和尚', '白龙马'],
        narrativeStructure: ['师徒相遇', '踏上征途', '历经磨难', '终成正果'],
        discussionQuestions: [
          '唐僧师徒为什么要去西天取经？',
          '你最喜欢哪个角色？为什么？',
          '遇到困难时，我们应该怎么做？',
        ],
      },
    };

    return chapters[chapter || 'journey'] || chapters['journey'];
  }

  generateCharacterCards(): {
    name: string;
    description: string;
    traits: string[];
    prompt: string;
  }[] {
    return [
      {
        name: '孙悟空',
        description: '机智勇敢，本领高强',
        traits: ['勇敢', '机智', '调皮', '忠诚'],
        prompt: '如果你是孙悟空，你会怎么保护师父？',
      },
      {
        name: '唐僧',
        description: '心地善良，意志坚定',
        traits: ['善良', '坚定', '慈悲', '执着'],
        prompt: '如果你是唐僧，遇到妖怪你会怎么办？',
      },
      {
        name: '猪八戒',
        description: '憨厚可爱，贪吃懒惰',
        traits: ['憨厚', '贪吃', '懒惰', '幽默'],
        prompt: '如果你是猪八戒，你想吃什么好吃的？',
      },
      {
        name: '沙和尚',
        description: '勤劳踏实，任劳任怨',
        traits: ['勤劳', '踏实', '忠诚', '沉默'],
        prompt: '如果你是沙和尚，你觉得挑行李辛苦吗？',
      },
    ];
  }

  generateNarrativeDrawingPrompt(chapter?: string): {
    title: string;
    drawingPrompts: string[];
    narrativePrompts: string[];
  } {
    const prompts: Record<string, {
      title: string;
      drawingPrompts: string[];
      narrativePrompts: string[];
    }> = {
      'birth': {
        title: '画出石猴出世',
        drawingPrompts: [
          '画出仙石的样子',
          '画出石猴第一次睁开眼睛的样子',
          '画出花果山的美景',
        ],
        narrativePrompts: [
          '仙石是什么样子的？',
          '石猴出生时发生了什么？',
          '花果山有哪些好玩的地方？',
        ],
      },
      'learning': {
        title: '画出拜师学艺',
        drawingPrompts: [
          '画出孙悟空渡海的场景',
          '画出菩提祖师的样子',
          '画出孙悟空学本领的样子',
        ],
        narrativePrompts: [
          '孙悟空是怎么找到师父的？',
          '菩提祖师长什么样子？',
          '孙悟空学了哪些本领？',
        ],
      },
      'havoc': {
        title: '画出大闹天宫',
        drawingPrompts: [
          '画出孙悟空和天兵天将打仗',
          '画出蟠桃会上的美食',
          '画出如来佛祖的手掌',
        ],
        narrativePrompts: [
          '孙悟空为什么要和天兵天将打仗？',
          '蟠桃会上有什么好吃的？',
          '如来佛祖是怎么抓住孙悟空的？',
        ],
      },
      'journey': {
        title: '画出西天取经',
        drawingPrompts: [
          '画出师徒四人一起走路的样子',
          '画出你最喜欢的妖怪',
          '画出取经路上的风景',
        ],
        narrativePrompts: [
          '师徒四人是怎么互相帮助的？',
          '你最喜欢哪个妖怪的故事？',
          '取经路上有哪些有趣的事情？',
        ],
      },
    };

    return prompts[chapter || 'journey'] || prompts['journey'];
  }

  generateFamilyDiscussionGuide(): {
    beforeReading: string[];
    duringReading: string[];
    afterReading: string[];
    recordingTips: string[];
  } {
    return {
      beforeReading: [
        '和孩子一起回忆之前讲过的故事',
        '问问孩子今天想听哪个章节',
        '准备好纸笔，方便记录孩子的想法',
      ],
      duringReading: [
        '适时停下来，问问孩子接下来会发生什么',
        '鼓励孩子描述故事中的人物和场景',
        '引导孩子表达自己喜欢或不喜欢的地方',
      ],
      afterReading: [
        '让孩子用自己的话复述故事',
        '讨论故事中的道理和启示',
        '鼓励孩子发挥想象，改编故事结局',
      ],
      recordingTips: [
        '选择一个安静的环境',
        '让孩子坐在舒适的位置',
        '保持自然的对话氛围',
        '不要打断孩子的表达',
        '可以适当提问引导',
      ],
    };
  }

  generatePodcastScript(episode: PodcastEpisode): string {
    const lines = [
      `【${episode.title}】`,
      `讲述人：${episode.childName}`,
      `章节：${episode.chapter}`,
      `角色：${episode.character}`,
      '',
      '---',
      '',
      episode.content,
      '',
      '---',
      '',
    ];

    if (episode.familyNotes) {
      lines.push('【家长笔记】');
      lines.push(episode.familyNotes);
      lines.push('');
    }

    lines.push(`录制时间：${episode.createdAt.toLocaleString()}`);

    return lines.join('\n');
  }
}
