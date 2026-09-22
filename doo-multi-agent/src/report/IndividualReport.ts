import { DOOAssessment, NarrativeInput } from '../core/types';
import { DOOModel } from '../doo/DOOModel';
import { OBSERVATION_POINTS, getLevelDescription } from '../doo/ObservationPoints';

/**
 * D博士个体报告生成器
 * 依据《个体报告模板》6部分结构：
 * 一、基本信息 二、DOO评分表 三、叙事表现描述 四、优势 五、发展建议 六、教师提示
 */

export interface IndividualReport {
  sections: Record<string, string>;
  fullText: string;
}

/** 维度小结文本 */
function getDimensionSummary(dims: DOOAssessment['dimensions']): string {
  const dictionAvg = ((dims.diction.vocabulary + dims.diction.sentenceStructure) / 2).toFixed(1);
  // 组织维度共 5 个观测点，此前漏了 timeMarker（只除 4），与 DOOModel.calculateDimensionAverage 口径不一致
  const orgAvg = (
    (dims.organization.narrativeStructure +
      dims.organization.timeMarker +
      dims.organization.themeRelevance +
      dims.organization.eventExpansion +
      dims.organization.expressiveness) /
    5
  ).toFixed(1);
  const opinionAvg = dims.opinion.narrativeViewpoint.toFixed(1);
  return `词句维度${dictionAvg}分，组织维度${orgAvg}分，观点维度${opinionAvg}分。`;
}

/** 从叙事文本中提取证据片段（用于DOO评分表） */
function extractEvidence(content: string, keywords: RegExp): string {
  const sentences = content.split(/[。！？!?]/).filter(s => s.trim());
  for (const sentence of sentences) {
    if (keywords.test(sentence)) {
      return sentence.trim();
    }
  }
  // 找不到完整句时取含关键词的最长片段
  const match = content.match(/[^。！？!?]*/g)?.filter(s => keywords.test(s))[0];
  return match ? match.trim() : '';
}

/** 生成叙事表现描述 */
function generateNarrativeDescription(dims: DOOAssessment['dimensions'], content: string): string {
  const vocabDesc = dims.diction.vocabulary <= 2
    ? `该幼儿词汇以日常用语为主`
    : dims.diction.vocabulary === 3
      ? `该幼儿能使用一定量的描述性词汇`
      : `该幼儿词汇较为丰富，能运用形象化表达`;
  const structureDesc = dims.organization.narrativeStructure <= 2
    ? `叙事结构较为简单，事件之间联系松散`
    : dims.organization.narrativeStructure === 3
      ? `叙事有一定结构，能基本串联起事件`
      : `叙事结构完整，事件之间衔接自然`;
  const opinionDesc = dims.opinion.narrativeViewpoint <= 2
    ? `较少表达个人观点和感受`
    : dims.opinion.narrativeViewpoint === 3
      ? `能表达基本感受`
      : `能清晰表达观点并说明理由`;
  return `${vocabDesc}；${structureDesc}；${opinionDesc}。叙事长度约${content.length}字。`;
}

/** 生成优势（2条具体表现） */
function generateStrengths(dims: DOOAssessment['dimensions'], content: string): string[] {
  const strengths: string[] = [];
  if (dims.diction.vocabulary >= 3) {
    strengths.push('词汇运用：能使用描述性/情感性词汇，如"很大""跳来跳去"等，使表达更生动。');
  } else if (dims.organization.narrativeStructure >= 3) {
    strengths.push('叙事组织：能按一定顺序讲述，包含背景、角色和事件，故事线索清晰。');
  }
  if (dims.opinion.narrativeViewpoint >= 3) {
    strengths.push('观点表达：能主动表达感受，如"我觉得…"，并用简单理由支撑。');
  } else if (dims.organization.eventExpansion >= 3) {
    strengths.push('细节描述：能对事件补充细节，使讲述更丰富。');
  }
  if (strengths.length === 0) {
    strengths.push('愿意参与叙事活动，能完整说出一个简单事件。');
    strengths.push('在教师引导下能补充一些信息，具备叙事基础。');
  }
  if (strengths.length === 1) {
    strengths.push('愿意在集体面前讲述，具备基本的叙事参与意愿。');
  }
  return strengths.slice(0, 2);
}

/** 生成发展建议（每个薄弱维度 1-2 条"做什么+怎么做+举例"） */
function generateSuggestions(dims: DOOAssessment['dimensions']): string[] {
  const suggestions: string[] = [];

  if (dims.diction.vocabulary < 3) {
    suggestions.push('【词汇水平】做什么：扩充描述性词汇。怎么做：用主题词卡玩"词语热身"，出示5-8张主题图片，教师补充描述。举例："这是蝴蝶，它有一双漂亮的翅膀。"');
  } else if (dims.diction.vocabulary < 4) {
    suggestions.push('【词汇水平】做什么：提升词汇丰富度。怎么做：用三格组句图做比喻挑战。举例："月亮像小船""云像棉花糖"。');
  }
  if (dims.diction.sentenceStructure < 3) {
    suggestions.push('【句子结构】做什么：学习连接词连句。怎么做：用三格组句图加入"和、但是、因为、所以"。举例："我喜欢夏天，并且喜欢秋天。"');
  } else if (dims.diction.sentenceStructure < 4) {
    suggestions.push('【句子结构】做什么：挑战多种句式。怎么做：用"句式超市"练习"因为…所以…""如果…就…"，用四种语气各说一次。');
  }
  if (dims.organization.narrativeStructure < 3) {
    suggestions.push('【叙事结构】做什么：建立故事结构意识。怎么做：用故事火车地图指出车头（开头）、车厢（经过）、车尾（结尾）。举例："我们先说什么时候的事，再说在哪里，后来发生了什么。"');
  }
  if (dims.organization.themeRelevance < 3) {
    suggestions.push('【主题贴切】做什么：围绕主题讲述。怎么做：用故事火车地图主题栏明确主题，跑题时温柔拉回。举例："我们讲的是谁？在哪里？发生了什么事？"');
  }
  if (dims.organization.eventExpansion < 3) {
    suggestions.push('【事件扩展】做什么：补充细节。怎么做：用五感提问（看到什么？听到什么？摸到什么？），做"一句变三句"。举例："小猫跑了"→"跑得很快，尾巴翘得高高的，还回头看了我一眼"。');
  }
  if (dims.opinion.narrativeViewpoint < 3) {
    suggestions.push('【叙事观点】做什么：表达个人观点。怎么做：用情绪观点卡练习观点句开头。举例："我觉得……""我喜欢……""如果是我会……"。');
  } else if (dims.opinion.narrativeViewpoint < 4) {
    suggestions.push('【叙事观点】做什么：观点+理由。怎么做：用理由卡追问"为什么"。举例："我最喜欢小兔子，因为它帮助了朋友。"');
  }
  if (dims.organization.expressiveness < 3) {
    suggestions.push('【表现性】做什么：让讲述更生动。怎么做：模仿角色声音、加动作表情。举例："小兔子说话细细的，大灰狼说话粗粗的。"');
  }

  if (suggestions.length === 0) {
    suggestions.push('幼儿叙事能力表现良好（4-5分），建议挑战更复杂的叙事任务：做"观点辩论""如果我来改"改编结局，或录制"个人故事集"。');
  }

  return suggestions;
}

/** 生成教师提示 */
function generateTeacherNotes(dims: DOOAssessment['dimensions'], content: string): string[] {
  const notes: string[] = [];
  notes.push(`证据充分度：叙事文本约${content.length}字，${content.length < 30 ? '内容较短，建议结合现场观察补充证据' : '能支撑本次评分'}。`);
  if (dims.organization.expressiveness < 3) {
    notes.push('表现性评分需教师结合录音补充（文字稿无法判断语音语调）。');
  }
  notes.push(`建议下次${dims.opinion.narrativeViewpoint < 3 ? '在讲述后追问观点（"你觉得呢？为什么？"）' : '提供更开放的讲述主题'}，并记录幼儿自发表达与引导后表达的差异。`);
  return notes;
}

/** 生成完整个体报告 */
export function generateIndividualReport(
  input: NarrativeInput,
  assessment: DOOAssessment
): IndividualReport {
  const dims = assessment.dimensions;
  const content = input.content || assessment.narrativeContent || '';

  // 一、基本信息
  const basicInfo = [
    `幼儿编号：${input.childId || assessment.childId}`,
    `年龄：5-6岁（大班）`,
    `活动场景：${assessment.scenario === 'smart_story_corner' ? '智能故事角' : assessment.scenario === 'narrative_train' ? '叙事火车' : '西游播客'}`,
    `主题：${content.slice(0, 20) || '日常叙事'}`,
    `评估日期：${new Date(assessment.timestamp).toLocaleDateString('zh-CN')}`,
  ].join('\n');

  // 二、DOO评分表
  const obsPoints = OBSERVATION_POINTS;
  const scoreRows = obsPoints.map(point => {
    let score: number;
    let evidence: string;
    let evidenceLabel = '【自发】';

    switch (point.name) {
      case '词汇水平':
        score = dims.diction.vocabulary;
        evidence = extractEvidence(content, /很大|漂亮|美丽|开心|高兴|高高的|大大的|跳来跳去|喜欢|好玩/);
        break;
      case '句子结构':
        score = dims.diction.sentenceStructure;
        evidence = extractEvidence(content, /因为|所以|如果|然后|先|再|在|和|但是/);
        break;
      case '叙事结构':
        score = dims.organization.narrativeStructure;
        evidence = extractEvidence(content, /有一天|从前|昨天|后来|最后|我和|我们/);
        break;
      case '时间标记':
        score = dims.organization.timeMarker;
        evidence = extractEvidence(content, /昨天|今天|从前|后来|然后|最后|先/);
        break;
      case '主题贴切':
        score = dims.organization.themeRelevance;
        evidence = extractEvidence(content, /去|看到|玩|一起/);
        break;
      case '事件扩展':
        score = dims.organization.eventExpansion;
        evidence = extractEvidence(content, /看到|听到|摸到|然后|后来|还有/);
        break;
      case '表现性':
        score = dims.organization.expressiveness;
        evidence = extractEvidence(content, /喊|叫|说|哇|哈哈|哦|大声|高兴地/);
        break;
      case '叙事观点':
        score = dims.opinion.narrativeViewpoint;
        evidence = extractEvidence(content, /我觉得|我喜欢|我认为|我想|我认为/);
        break;
      default:
        score = 1;
        evidence = '';
    }

    if (!evidence) {
      evidence = '样本不足';
      evidenceLabel = '';
    }

    const levelText = score < 3 ? '需支持' : score < 4 ? '基本达到' : '表现良好';
    return `  ${point.name}：${score}分${'★'.repeat(score)}${'☆'.repeat(5 - score)}（${levelText}）${evidenceLabel}证据：${evidence || '未找到明确原话'}`;
  }).join('\n');

  const dimSummary = getDimensionSummary(dims);

  // 三、叙事表现描述
  const narrativeDesc = generateNarrativeDescription(dims, content);

  // 四、优势
  const strengths = generateStrengths(dims, content).map(s => `  • ${s}`).join('\n');

  // 五、发展建议
  const suggestions = generateSuggestions(dims).map(s => `  • ${s}`).join('\n');

  // 六、教师提示
  const teacherNotes = generateTeacherNotes(dims, content).map(s => `  • ${s}`).join('\n');

  const overall = DOOModel.calculateOverallLevel(dims);

  const sections: Record<string, string> = {
    basicInfo,
    scoreTable: `${scoreRows}\n\n维度小结：${dimSummary}`,
    narrativeDesc,
    strengths,
    suggestions,
    teacherNotes,
  };

  const fullText = [
    `【D博士个体评估报告】`,
    ``,
    `一、基本信息`,
    basicInfo,
    ``,
    `二、DOO评分表（整体${overall}分 ${'★'.repeat(overall)}${'☆'.repeat(5 - overall)}）`,
    scoreRows,
    ``,
    `  维度小结：${dimSummary}`,
    ``,
    `三、叙事表现描述`,
    `  ${narrativeDesc}`,
    ``,
    `四、优势`,
    strengths,
    ``,
    `五、发展建议`,
    suggestions,
    ``,
    `六、教师提示`,
    teacherNotes,
  ].join('\n');

  return { sections, fullText };
}

/** 生成对比评估报告 */
export function generateComparisonReport(
  before: DOOAssessment,
  after: DOOAssessment
): string {
  const change = (a: number, b: number) => (b - a > 0 ? `+${b - a}` : `${b - a}`);
  const dims = (a: DOOAssessment) => a.dimensions;

  const rows = [
    `  词汇水平：${dims(before).diction.vocabulary} → ${dims(after).diction.vocabulary}（${change(dims(before).diction.vocabulary, dims(after).diction.vocabulary)}）`,
    `  句子结构：${dims(before).diction.sentenceStructure} → ${dims(after).diction.sentenceStructure}（${change(dims(before).diction.sentenceStructure, dims(after).diction.sentenceStructure)}）`,
    `  叙事结构：${dims(before).organization.narrativeStructure} → ${dims(after).organization.narrativeStructure}（${change(dims(before).organization.narrativeStructure, dims(after).organization.narrativeStructure)}）`,
    `  主题贴切：${dims(before).organization.themeRelevance} → ${dims(after).organization.themeRelevance}（${change(dims(before).organization.themeRelevance, dims(after).organization.themeRelevance)}）`,
    `  事件扩展：${dims(before).organization.eventExpansion} → ${dims(after).organization.eventExpansion}（${change(dims(before).organization.eventExpansion, dims(after).organization.eventExpansion)}）`,
    `  表现性：${dims(before).organization.expressiveness} → ${dims(after).organization.expressiveness}（${change(dims(before).organization.expressiveness, dims(after).organization.expressiveness)}）`,
    `  叙事观点：${dims(before).opinion.narrativeViewpoint} → ${dims(after).opinion.narrativeViewpoint}（${change(dims(before).opinion.narrativeViewpoint, dims(after).opinion.narrativeViewpoint)}）`,
  ].join('\n');

  const beforeAvg = DOOModel.calculateOverallLevel(dims(before));
  const afterAvg = DOOModel.calculateOverallLevel(dims(after));
  const overallChange = afterAvg - beforeAvg;

  const highlights: string[] = [];
  if (afterAvg > beforeAvg) highlights.push(`整体得分提升${overallChange}分，叙事能力呈上升趋势。`);
  if (dims(after).diction.vocabulary > dims(before).diction.vocabulary) highlights.push('词汇水平有进步，能使用更多描述性词汇。');
  if (dims(after).organization.eventExpansion > dims(before).organization.eventExpansion) highlights.push('事件扩展能力增强，能补充更多细节。');
  if (highlights.length === 0) highlights.push('两次评估整体得分稳定，需关注具体维度的细微变化。');

  const stillSupport: string[] = [];
  if (dims(after).diction.vocabulary < 3) stillSupport.push('词汇水平仍需支持（<3分）。');
  if (dims(after).organization.narrativeStructure < 3) stillSupport.push('叙事结构仍需支持（<3分）。');
  if (dims(after).opinion.narrativeViewpoint < 3) stillSupport.push('观点表达仍需支持（<3分）。');
  if (stillSupport.length === 0) stillSupport.push('各维度均达3分以上，表现良好。');

  return [
    `【D博士对比评估报告】`,
    ``,
    `两次评估信息`,
    `  前测：${new Date(before.timestamp).toLocaleDateString('zh-CN')}（整体${beforeAvg}分）`,
    `  后测：${new Date(after.timestamp).toLocaleDateString('zh-CN')}（整体${afterAvg}分）`,
    ``,
    `得分变化表`,
    rows,
    ``,
    `变化亮点`,
    highlights.map(h => `  • ${h}`).join('\n'),
    ``,
    `仍需支持`,
    stillSupport.map(s => `  • ${s}`).join('\n'),
    ``,
    `下阶段计划`,
    `  • ${stillSupport.some(s => s.includes('词汇')) ? '持续用主题词卡扩充词汇，每2周复测。' : '可提升挑战度，尝试更复杂的叙事主题。'}`,
    `  • 建议下次记录幼儿自发表达与引导后表达的差异，作为评估补充证据。`,
  ].join('\n');
}

/** 生成班级画像报告 */
export function generateClassReport(
  className: string,
  assessments: DOOAssessment[]
): string {
  if (assessments.length === 0) return `【班级画像】${className}暂无评估数据。`;

  const dimsList = assessments.map(a => a.dimensions);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const count = (pred: (d: typeof dimsList[0]) => boolean) => dimsList.filter(pred).length;

  const avgVocab = avg(dimsList.map(d => d.diction.vocabulary));
  const avgStruct = avg(dimsList.map(d => d.organization.narrativeStructure));
  const avgOpinion = avg(dimsList.map(d => d.opinion.narrativeViewpoint));

  const basicCount = count(d => d.diction.vocabulary < 3 && d.organization.narrativeStructure < 3);
  const midCount = count(d => d.diction.vocabulary >= 3 && d.diction.vocabulary < 4);
  const advancedCount = count(d => d.diction.vocabulary >= 4);

  return [
    `【D博士班级画像】${className}`,
    ``,
    `样本信息`,
    `  样本人数：${assessments.length}人`,
    ``,
    `得分分布（5分制）`,
    `  平均词汇水平：${avgVocab.toFixed(1)}分`,
    `  平均叙事结构：${avgStruct.toFixed(1)}分`,
    `  平均观点表达：${avgOpinion.toFixed(1)}分`,
    `  需支持(<3分)：${basicCount}人`,
    `  基本达到(3-4分)：${midCount}人`,
    `  表现良好(4-5分)：${advancedCount}人`,
    ``,
    `共性优势`,
    `  • ${avgStruct >= 3 ? '多数幼儿能按一定顺序组织叙事' : '幼儿普遍愿意参与叙事活动'}`,
    `  • ${avgVocab >= 3 ? '部分幼儿能使用描述性词汇' : '词汇基础尚可，有提升空间'}`,
    ``,
    `共性问题`,
    `  • ${avgOpinion < 3 ? '观点表达普遍较弱，多数幼儿不主动表达个人感受' : '观点表达有待进一步深化'}`,
    `  • ${avgVocab < 3 ? '词汇水平整体偏低，描述性词汇使用不足' : '词汇水平中等，可挑战更丰富的表达'}`,
    ``,
    `分组建议`,
    `  • 基础组（<3分）：加强词汇积累和完整句练习，用主题词卡+三格组句图。`,
    `  • 提升组（3-4分）：强化叙事结构和细节扩展，用故事火车地图+情节排序卡。`,
    `  • 进阶组（4-5分）：发展观点表达和表现性，用情绪观点卡+心情观点图+想法记录册。`,
    ``,
    `下阶段活动建议`,
    `  • 开展"故事小火车"接龙活动，强化叙事结构。`,
    `  • 每周一次"故事评论员"环节，鼓励表达观点。`,
    `  • 结合"一卡一图一册"载体，分层实施支持策略。`,
  ].join('\n');
}
