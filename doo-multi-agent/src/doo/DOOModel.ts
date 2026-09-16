import {
  DOODimensions,
  DOOAssessment,
  Level,
  NarrativeInput,
  ScenarioType,
} from '../core/types';
import { v4 as uuidv4 } from 'uuid';

export class DOOModel {
  static createEmptyDimensions(): DOODimensions {
    return {
      diction: {
        vocabulary: 1,
        sentenceStructure: 1,
      },
      organization: {
        narrativeStructure: 1,
        timeMarker: 1,
        themeRelevance: 1,
        eventExpansion: 1,
        expressiveness: 1,
      },
      opinion: {
        narrativeViewpoint: 1,
      },
    };
  }

  static calculateOverallLevel(dimensions: DOODimensions): Level {
    // 8个观测点总分平均，四舍五入到最近的1-5分
    const scores = [
      dimensions.diction.vocabulary,
      dimensions.diction.sentenceStructure,
      dimensions.organization.narrativeStructure,
      dimensions.organization.timeMarker,
      dimensions.organization.themeRelevance,
      dimensions.organization.eventExpansion,
      dimensions.organization.expressiveness,
      dimensions.opinion.narrativeViewpoint,
    ];
    const total = scores.reduce((s, v) => s + v, 0);
    const average = total / 8;

    // 5分制：整体平均分四舍五入到最近的1-5分
    return Math.max(1, Math.min(5, Math.round(average))) as Level;
  }

  static calculateDimensionAverage(dimensions: DOODimensions): {
    diction: number;
    organization: number;
    opinion: number;
  } {
    const dictionAvg =
      (dimensions.diction.vocabulary + dimensions.diction.sentenceStructure) / 2;

    const orgAvg =
      (dimensions.organization.narrativeStructure +
        dimensions.organization.timeMarker +
        dimensions.organization.themeRelevance +
        dimensions.organization.eventExpansion +
        dimensions.organization.expressiveness) /
      5;

    const opinionAvg = dimensions.opinion.narrativeViewpoint;

    return {
      diction: Math.round(dictionAvg * 100) / 100,
      organization: Math.round(orgAvg * 100) / 100,
      opinion: Math.round(opinionAvg * 100) / 100,
    };
  }

  static createAssessment(
    narrativeInput: NarrativeInput,
    dimensions: DOODimensions,
    suggestions: string[]
  ): DOOAssessment {
    return {
      id: uuidv4(),
      childId: narrativeInput.childId,
      childName: narrativeInput.childName,
      classId: narrativeInput.classId,
      timestamp: new Date(),
      dimensions,
      overallLevel: this.calculateOverallLevel(dimensions),
      suggestions,
      narrativeContent: narrativeInput.content,
      scenario: narrativeInput.scenario,
    };
  }

  static getDimensionDescription(dimension: keyof DOODimensions): string {
    const descriptions: Record<string, string> = {
      diction: '词句维度：评估幼儿使用的词汇丰富度和句子结构复杂度',
      organization: '语言组织维度：评估幼儿叙事的结构完整性和内容组织',
      opinion: '独白观点维度：评估幼儿表达个人观点和感受的能力',
    };
    return descriptions[dimension] || '';
  }

  static getLevelLabel(level: Level): string {
    if (level >= 4) return '高级';
    if (level >= 3) return '中级';
    return '初级';
  }

  static generateDefaultSuggestions(dimensions: DOODimensions): string[] {
    const suggestions: string[] = [];

    // 5分制建议：1-2分需重点支持，3分巩固提升，4-5分保持进阶
    if (dimensions.diction.vocabulary <= 2) {
      suggestions.push('【发展关切点：词汇水平】建议使用主题词卡进行词语热身（出示5—8张主题图片，幼儿说出名称，教师补充描述），并引导幼儿运用形容词、副词等描述性词汇。');
    } else if (dimensions.diction.vocabulary === 3) {
      suggestions.push('【发展关切点：词汇水平】建议用三格组句图练习"一句话变长"，加入颜色、大小、动作、心情，并尝试使用比喻（"月亮像小船""云像棉花糖"）。');
    } else {
      suggestions.push('【发展关切点：词汇水平】幼儿词汇已达较丰富水平，建议挑战"高级词挑战"（如"又粗又响""震得树叶唰唰地抖"），并运用描述性、情感性词汇。');
    }
    if (dimensions.diction.sentenceStructure <= 2) {
      suggestions.push('【发展关切点：句子结构】建议用三格组句图摆出"谁+在哪里+做什么"说完整句，进行句子接龙，学习使用"和、但是、因为、所以"等连接词。');
    } else if (dimensions.diction.sentenceStructure === 3) {
      suggestions.push('【发展关切点：句子结构】建议挑战"句式超市"（因为…所以…/如果…就…/当…的时候）和四种语气（陈述、疑问、祈使、感叹）。');
    } else {
      suggestions.push('【发展关切点：句子结构】幼儿已能灵活运用多种句式，建议结合情景灵活运用陈述、疑问、祈使、感叹等句式讲述。');
    }
    if (dimensions.organization.narrativeStructure <= 2) {
      suggestions.push('【发展关切点：叙事结构】建议用故事火车地图指出车头（开头）、车厢（经过）、车尾（结尾），用情节排序卡把2—4张图排成顺序再讲述。');
    } else if (dimensions.organization.narrativeStructure === 3) {
      suggestions.push('【发展关切点：叙事结构】建议用故事火车地图"缺什么补什么"，加入转折词（突然、可是、没想到），串联3—4个事件讲成一个故事。');
    } else {
      suggestions.push('【发展关切点：叙事结构】幼儿已能完整组织叙事，建议挑战多视角重讲故事、创编续集，讲清事件之间的关系。');
    }
    if (dimensions.organization.timeMarker <= 2) {
      suggestions.push('【发展关切点：时间标记】建议用情节排序卡玩"先后顺序游戏"（先刷牙→再洗脸→然后吃早餐），并用"然后呢？"追问鼓励使用时间词。');
    } else if (dimensions.organization.timeMarker === 3) {
      suggestions.push('【发展关切点：时间标记】建议用时间词卡升级（从前、后来、第二天早晨、夜晚），做"三次时间词挑战"：开头、中间、结尾各用一次。');
    } else {
      suggestions.push('【发展关切点：时间标记】幼儿已能灵活运用时间标记，建议在叙事中综合运用多种时间副词，建立清晰完整的时间线索。');
    }
    if (dimensions.organization.themeRelevance <= 2) {
      suggestions.push('【发展关切点：主题贴切】建议用故事火车地图主题栏明确主题（"今天我们只讲去动物园的事"），幼儿跑题时温柔拉回。');
    } else if (dimensions.organization.themeRelevance === 3) {
      suggestions.push('【发展关切点：主题贴切】建议用"一句话主题句"（开始前说"我要讲的是……"），请同伴当"主题核对员"判断故事在哪里离开主题。');
    } else {
      suggestions.push('【发展关切点：主题贴切】幼儿已能持续围绕主题讲述，建议增加限定条件（"故事里只能出现三种动物"），挑战更复杂的故事线索。');
    }
    if (dimensions.organization.eventExpansion <= 2) {
      suggestions.push('【发展关切点：事件扩展】建议用情节排序卡做"细节放大镜"，用五感提问（看到什么？听到什么？摸到什么？），做"一句变三句"练习。');
    } else if (dimensions.organization.eventExpansion === 3) {
      suggestions.push('【发展关切点：事件扩展】建议给角色加对话和心理活动（"小鸟说：我来帮你""角色心里在想什么？"），用细节三问（为什么？怎么做？结果怎样？）。');
    } else {
      suggestions.push('【发展关切点：事件扩展】幼儿已能详细描述事件，建议对重点情节用4—5句话放大讲述，从看、听、摸、心情多角度描述。');
    }
    if (dimensions.organization.expressiveness <= 2) {
      suggestions.push('【发展关切点：表现性】建议用情绪观点卡做声音放大游戏和模仿角色声音（大象粗粗的、小鸟细细的），练习"同一句话三种语气"。');
    } else if (dimensions.organization.expressiveness === 3) {
      suggestions.push('【发展关切点：表现性】建议用心情观点图加入拟声词（呼呼、哗啦、咚咚）和动作表情，站上"小舞台"讲述。');
    } else {
      suggestions.push('【发展关切点：表现性】幼儿已能生动表现，建议做"情绪转换挑战"（同一角色从开心到难过）和"播客小主播"录制讲述。');
    }
    if (dimensions.opinion.narrativeViewpoint <= 2) {
      suggestions.push('【发展关切点：叙事观点】建议用情绪观点卡认识情绪脸谱、替角色说心情，练习观点句开头（"我觉得……""我喜欢……""如果是我会……"）。');
    } else if (dimensions.opinion.narrativeViewpoint === 3) {
      suggestions.push('【发展关切点：叙事观点】建议用理由卡追问"为什么"，做观点投票（选最喜欢的角色并说理由），当"故事评论员"（我最喜欢……因为……）。');
    } else {
      suggestions.push('【发展关切点：叙事观点】幼儿已能清晰表达观点，建议做"观点辩论"和"如果我来改"（改编结局或角色做法并说明理由）。');
    }

    if (suggestions.length === 0) {
      suggestions.push('幼儿叙事能力发展良好，建议挑战更丰富的叙事任务：用"如果我来改"改编结局，做观点辩论，或录制"个人故事集"。');
    }

    return suggestions;
  }
}
