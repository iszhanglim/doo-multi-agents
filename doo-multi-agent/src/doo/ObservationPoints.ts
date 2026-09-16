import { ObservationPoint } from '../core/types';

export const OBSERVATION_POINTS: ObservationPoint[] = [
  {
    name: '词汇水平',
    dimension: 'diction',
    level1Description: '使用最普通的措词，语言简单，几乎不使用形容词。',
    level2Description: '使用水平1的语言，但也出现一些描述性的、具有表现力的词汇；使用一些形容词。',
    level3Description: '使用多种词汇，包括形容词和副词；常常使用描述性的、情感性的词汇。语言是清楚而详细的，并具有表现力。',
    detailedLevels: {
      level1: '使用最普通的措词，语言简单，几乎不使用形容词。幼儿在讲述中说出事件中相关的人、事、物的名称。',
      level2: '使用常见的动词讲述人、事、物之间的简单关系。幼儿能讲清楚谁做了什么，同时也出现一些描述性的词汇，用来描写样子或特征。',
      level3: '能表达自己的感受与评价。如"我喜欢""小小的毛毛虫""把球踢得远远的""五彩缤纷的花朵"等。',
      level4: '幼儿能运用生活中习得的形象词语。如运用"又粗又响""震得树叶唰唰地抖"等形象的词句描述老虎的声音。',
      level5: '幼儿能以清楚、详细的语言表达。学会依据讲述的场合、对象和目的等因素，灵活地运用各类名词、动词、形容词和副词等。幼儿常常使用描述性的、描述情绪的情感性词汇。',
    },
    carriers: {
      card: '主题词卡（按主题分袋，每袋8-12张；正面图片，反面词语+例句；分名词、动词、形容词、副词四类）',
      map: '三格组句图（"谁—在哪里—做什么—怎么样"底板，附连接词栏和语气标记）',
      book: '词句积累册（按主题分页，记录"新词、我用它说的话、老师帮我记的好句子"）',
    },
  },
  {
    name: '句子结构',
    dimension: 'diction',
    level1Description: '使用简单句，句子结构单一，多为短句。',
    level2Description: '能够使用一些复合句，句子长度适中，偶尔出现连接词。',
    level3Description: '使用多种句型，包括复合句和复杂句；句子结构丰富，连接词使用恰当。',
    detailedLevels: {
      level1: '儿童讲述时使用简单、不连贯的句子。',
      level2: '儿童讲述出现多个句子时，句子与句子之间是并列的。',
      level3: '儿童使用水平1的句子，但讲述中出现介词性词组和复合句，或二者同时使用。如"在山坡上""我喜欢夏天，并且喜欢秋天"。',
      level4: '使用两种及以上不同的句式。',
      level5: '儿童使用大量的句子结构，不仅包括水平1和水平2的句子结构，还包括状语从句、定语从句、分词短语或几者混合使用。儿童能够根据讲述的场合、对象、目的等因素，灵活地运用陈述、疑问、祈使和感叹等句式。',
    },
    carriers: {
      card: '主题词卡（抽卡造句、名称动作配对）',
      map: '三格组句图（句子接龙、一句话变长、复合句挑战、四种语气）',
      book: '词句积累册（记录第一个完整句、复合句例句、复述挑战）',
    },
  },
  {
    name: '叙事结构',
    dimension: 'organization',
    level1Description: '叙事缺乏清晰结构，事件描述混乱，难以辨认开头、中间和结尾。',
    level2Description: '叙事有基本结构，能够区分主要事件，但过渡不够流畅。',
    level3Description: '叙事结构完整清晰，有明确的开头、发展和结尾；事件顺序合理，过渡自然。',
    detailedLevels: {
      level1: '幼儿的叙事中包含背景、角色定义、事件、结局中的1个要素。',
      level2: '围绕主题讲述一些相关内容，可能包含一、两个行动事件。幼儿叙事中包含背景、角色定义、事件、结局中的2个要素。',
      level3: '围绕主题讲述几个相关的行动事件，并串联起一个故事。',
      level4: '幼儿的叙事中包含背景、角色定义、事件、结局中的3个及以上要素。',
      level5: '围绕主题讲清楚几个行动事件及其之间的关系。',
    },
    carriers: {
      card: '情节排序卡（每套3-4张，正面情节图，反面短句；附"开始—经过—结果"标识）',
      map: '故事火车地图（三节车厢：车头开头、车厢经过、车尾结尾；下方时间线，上方主题栏）',
      book: '故事记录册（记录故事题目、日期、场景、故事地图、用到的词和时间词）',
    },
  },
  {
    name: '时间标记',
    dimension: 'organization',
    level1Description: '仅使用简单时间连词（当时、然后、现在等），缺乏时间逻辑。',
    level2Description: '使用较复杂时间标记（从前、后来、直到…为止；时间副词：夜晚、第二天早晨等）。',
    level3Description: '连续使用复杂时间标记，时间逻辑清晰，叙事有明确的时间线索。',
    detailedLevels: {
      level1: '儿童在说明故事的过程中仅仅使用简单的时间连词，如当时、然后、现在等。',
      level2: '儿童仅一次使用较复杂的时间标记，如从前、后来、直到…为止、一会儿、其次。',
      level3: '儿童仅一次使用时间副词说明事件发生的时间（夜晚、第二天早晨、很多年以前等）。',
      level4: '儿童连续三次使用较复杂的时间标记。',
      level5: '儿童能够灵活运用多种时间标记，建立完整、清晰的时间线索。',
    },
    carriers: {
      card: '情节排序卡（先后顺序游戏：先刷牙→再洗脸→然后吃早餐）',
      map: '故事火车地图时间线（按"早晨—白天—晚上—第二天"排列）',
      book: '故事记录册（记录用对的复杂时间标记，达到3次评为"时间达人"）',
    },
  },
  {
    name: '主题贴切',
    dimension: 'organization',
    level1Description: '叙事内容与主题关联较弱，容易偏离主题。',
    level2Description: '叙事基本围绕主题展开，偶尔出现与主题无关的内容。',
    level3Description: '叙事紧扣主题，内容集中，所有细节都服务于主题表达。',
    detailedLevels: {
      level1: '一个想法到另一个想法之间的转换不清楚。儿童注意力分散，故事线索断开而不衔接。',
      level2: '故事线索含糊且只能维持一小段。儿童简单地用一些较无关的线索编成零散的故事。',
      level3: '连续超过四句话保持故事线索的一致性和相对连续性，很少偏离故事的发展。',
      level4: '把时间联系起来，并最终构成故事线索。',
      level5: '儿童很少偏离故事的发展，能够完整、连贯地围绕主题展开叙事。',
    },
    carriers: {
      card: '情节排序卡（限定同一组图片，只围绕图片讲述）',
      map: '故事火车地图主题栏（明确主题："今天我们只讲去动物园的事"；一句话主题句）',
      book: '故事记录册（记录跑题位置和拉回方法，主题摘要）',
    },
  },
  {
    name: '事件扩展',
    dimension: 'organization',
    level1Description: '对事件的描述简单，缺乏细节，仅提及基本事实。',
    level2Description: '能够提供一些细节描述，对主要事件有一定扩展。',
    level3Description: '对事件进行丰富详细的描述，包含多个细节和层次，能够深入展开。',
    detailedLevels: {
      level1: '描述空洞且不详细。儿童叙事仅有简单的几句话组成。',
      level2: '有时描述事件中人物外貌、语言、心理活动等。',
      level3: '对某些经历的某些特定细节加以细述。',
      level4: '描述往往较丰富详细。',
      level5: '儿童对重要的事件加以详细描述，能够运用五感细节、心理活动、角色对话等丰富叙事。',
    },
    carriers: {
      card: '情节排序卡（"细节放大镜"：它是什么颜色？在做什么？）',
      map: '三格组句图（"一句变三句"：小猫跑了→跑得很快，尾巴翘得高高的，还回头看了我一眼）',
      book: '故事记录册（记录新加细节、扩展出的情节、角色心理独白）',
    },
  },
  {
    name: '表现性',
    dimension: 'organization',
    level1Description: '叙事平铺直叙，缺乏情感色彩和生动性。',
    level2Description: '叙事有一定生动性，偶尔使用形象化语言。',
    level3Description: '叙事生动形象，善于使用比喻、拟人等修辞手法，富有感染力。',
    detailedLevels: {
      level1: '故事中未使用或很少使用语调。用单一的语调呈现故事，而未根据角色不同而运用不同的语气或声音效果。',
      level2: '儿童偶尔使用声音效果。',
      level3: '儿童使用其他形式的表达（角色语气、加强语气、唱歌）。',
      level4: '儿童不断地使用声音效果。',
      level5: '生动的角色语气，高度表现力的叙述。',
    },
    carriers: {
      card: '情绪观点卡（声音放大游戏、模仿角色声音、同一句话三种语气）',
      map: '心情观点图（语气变变变、加入拟声词"呼呼、哗啦、咚咚"、加动作和表情）',
      book: '想法记录册（"播客小主播"：录制故事，回听并改进）',
    },
  },
  {
    name: '叙事观点',
    dimension: 'opinion',
    level1Description: '仅描述事件本身，不表达个人观点或感受。',
    level2Description: '能够简单表达个人感受，但观点不够明确或深入。',
    level3Description: '能够清晰表达个人观点和感受，并能给出理由；具有批判性思维。',
    detailedLevels: {
      level1: '儿童知道在集体面前讲述与日常谈话有所不同，儿童愿意在集体面前讲话。',
      level2: '借助于凭借物，能够围绕叙事主题进行简单构思并在集体面前讲述。讲述时借助一些简单的表情、动作进行形象表现。',
      level3: '借助于凭借物，围绕叙事主题进行较完整的构思并在集体面前讲述。',
      level4: '儿童讲述时，会表达自己的一些观点和评价来增强叙事的情感色彩。',
      level5: '儿童能够主动、清晰地表达个人观点，并用"因为……"等说明理由，具备初步的批判性思维和观点论证能力。',
    },
    carriers: {
      card: '情绪观点卡（认识情绪脸谱、替角色说心情、观点句开头"我觉得/我喜欢/如果是我"）',
      map: '心情观点图（情绪温度计、故事心情线、观点投票区）',
      book: '想法记录册（记录"我的想法"：谁、在哪里、发生什么，以及我的观点和理由）',
    },
  },
];

/** 一卡一图一册总览（对应文档） */
export const CARRIER_OVERVIEW = {
  diction: {
    dimension: '词句发展',
    card: '主题词卡',
    map: '三格组句图',
    book: '词句积累册',
  },
  organization: {
    dimension: '语言组织',
    card: '情节排序卡',
    map: '故事火车地图',
    book: '故事记录册',
  },
  opinion: {
    dimension: '独白观点',
    card: '情绪观点卡',
    map: '心情观点图',
    book: '想法记录册',
  },
};

export function getObservationPointsByDimension(
  dimension: 'diction' | 'organization' | 'opinion'
): ObservationPoint[] {
  return OBSERVATION_POINTS.filter(point => point.dimension === dimension);
}

export function getObservationPointByName(name: string): ObservationPoint | undefined {
  return OBSERVATION_POINTS.find(point => point.name === name);
}

export function getLevelDescription(point: ObservationPoint, level: number): string {
  // 5分制：优先返回5级详细指标，否则映射到3级基础描述
  if (point.detailedLevels) {
    const key = `level${Math.max(1, Math.min(5, level))}` as keyof typeof point.detailedLevels;
    const detailed = point.detailedLevels[key];
    if (detailed) return detailed;
  }
  switch (level) {
    case 1:
      return point.level1Description;
    case 2:
      return point.level2Description;
    case 3:
    case 4:
    case 5:
      return point.level3Description;
    default:
      return '';
  }
}

/** 获取某一关切点的5级详细指标 */
export function getDetailedLevelDescription(point: ObservationPoint, level: number): string {
  if (!point.detailedLevels) return getLevelDescription(point, level as 1 | 2 | 3);
  const key = `level${level}` as keyof typeof point.detailedLevels;
  return point.detailedLevels[key] || '';
}

/** 获取某一关切点的一卡一图一册载体建议 */
export function getCarrierSuggestion(point: ObservationPoint): string {
  if (!point.carriers) return '';
  return `一卡：${point.carriers.card}；一图：${point.carriers.map}；一册：${point.carriers.book}`;
}
