import { DOODimensions, DOOAssessment, Level, NarrativeInput } from '../core/types';
import { DOOModel } from './DOOModel';
import { LLMClient, CompleteOptions } from '../nlp/LLMClient';
import { sanitizeMetaText } from '../nlp/sanitize';
import {
  splitSentences,
  extractWords,
  countWordsInList,
  ADJECTIVES,
  ADVERBS,
  DESCRIPTIVE_WORDS,
  EMOTIONAL_WORDS,
} from '../nlp/utils';

export interface AssessmentResult {
  dimensions: DOODimensions;
  confidence: number;
  reasoning: string;
}

/** 简单时间连词（量表水平 1） */
const SIMPLE_TIME_MARKERS: readonly string[] = ['当时', '然后', '现在', '接着', '后来'];
/** 复杂时间标记（量表水平 3-5）；与 simple 存在重叠是量表本身如此（"后来"两者皆可） */
const COMPLEX_TIME_MARKERS: readonly string[] = [
  '从前', '后来', '直到', '为止', '一会儿', '其次',
  '夜晚', '第二天', '早晨', '很多年以前', '很久以前',
  '首先', '最后', '终于', '突然', '忽然',
];
/**
 * 「连续使用较复杂时间标记」判定所用的子集。
 * 排除「首先/最后/终于」——它们是收尾/顺序词，误计会高估时间线索水平。
 */
const REPEATED_COMPLEX_TIME_MARKERS: readonly string[] = COMPLEX_TIME_MARKERS.filter(
  (m) => !['首先', '最后', '终于'].includes(m)
);

/** 统计一组关键词在文本中出现的总次数 */
function countOccurrences(text: string, markers: readonly string[]): number {
  if (markers.length === 0) return 0;
  const re = new RegExp(markers.join('|'), 'g');
  return (text.match(re) || []).length;
}

export class AssessmentEngine {
  private llmClient: LLMClient;
  private useLLM: boolean;
  /** 调用级 LLM 参数（systemPrompt / temperature / model），由 ExpertAgent 按自身配置注入 */
  private requestOptions: CompleteOptions;

  constructor(llmClient: LLMClient, useLLM = true, requestOptions: CompleteOptions = {}) {
    this.llmClient = llmClient;
    this.useLLM = useLLM;
    this.requestOptions = requestOptions;
  }

  async assess(narrativeInput: NarrativeInput): Promise<DOOAssessment> {
    const content = narrativeInput.content;

    const ruleBasedResult = this.ruleBasedAssessment(content);

    let finalDimensions: DOODimensions;
    let confidence: number;
    let reasoning: string;

    if (!this.useLLM) {
      finalDimensions = ruleBasedResult.dimensions;
      confidence = ruleBasedResult.confidence;
      reasoning = ruleBasedResult.reasoning;
    } else {
      try {
        const llmResult = await this.llmBasedAssessment(content);
        const divergence = this.calculateDivergence(ruleBasedResult.dimensions, llmResult.dimensions);

        if (divergence > 1) {
          // 差距过大，触发第二轮 LLM 验证
          console.log(`评分分歧较大(${divergence.toFixed(1)})，启动第二轮验证...`);
          const verifyResult = await this.llmVerifyAssessment(content, ruleBasedResult.dimensions, llmResult.dimensions);
          finalDimensions = verifyResult.dimensions;
          confidence = verifyResult.confidence;
          reasoning = `规则评估与首轮LLM评估存在分歧，经二次验证后：${verifyResult.reasoning}`;
        } else {
          finalDimensions = this.mergeAssessments(ruleBasedResult.dimensions, llmResult.dimensions);
          confidence = llmResult.confidence;
          reasoning = llmResult.reasoning;
        }
      } catch (error) {
        console.warn('LLM assessment failed, using rule-based only:', error);
        finalDimensions = ruleBasedResult.dimensions;
        confidence = ruleBasedResult.confidence;
        reasoning = ruleBasedResult.reasoning;
      }
    }

    const suggestions = DOOModel.generateDefaultSuggestions(finalDimensions);

    if (reasoning) {
      // 清洗 LLM reasoning 中混入的元话语（"输出风格""内容已验证"等），避免污染教师可见建议
      const analysis = sanitizeMetaText(`评估分析：${reasoning}`);
      if (analysis) suggestions.unshift(analysis);
    }

    return DOOModel.createAssessment(narrativeInput, finalDimensions, suggestions);
  }

  async assessBatch(inputs: NarrativeInput[]): Promise<DOOAssessment[]> {
    const results: DOOAssessment[] = [];
    for (const input of inputs) {
      try {
        const assessment = await this.assess(input);
        results.push(assessment);
      } catch (error) {
        console.error(`Assessment failed for child ${input.childId}:`, error);
      }
    }
    return results;
  }

  private ruleBasedAssessment(content: string): AssessmentResult {
    const dimensions = DOOModel.createEmptyDimensions();
    const text = content.trim();
    const sentences = splitSentences(text);
    const words = extractWords(text);

    // ========== 词句维度评估 ==========
    const adjectives = countWordsInList(words, ADJECTIVES);
    const adverbs = countWordsInList(words, ADVERBS);
    const descriptiveWords = countWordsInList(words, DESCRIPTIVE_WORDS);
    const emotionalWords = countWordsInList(words, EMOTIONAL_WORDS);
    const prepositionalPhrases = this.countPrepositionalPhrases(sentences);
    const compoundSentences = this.countCompoundSentences(sentences);
    const complexSentences = this.countComplexSentences(sentences);

    // 词汇水平（5分制，基于《学前儿童叙事能力评定表》）
    if (adjectives >= 4 && adverbs >= 3 && (descriptiveWords >= 3 || emotionalWords >= 3)) {
      dimensions.diction.vocabulary = 5; // 水平5：语言清楚详细，灵活运用各类词，常使用描述性、情感性词汇
    } else if (adjectives >= 3 && adverbs >= 2 && (descriptiveWords >= 2 || emotionalWords >= 2)) {
      dimensions.diction.vocabulary = 4; // 水平4：运用生活中习得的形象词语
    } else if (adjectives >= 2 || (descriptiveWords >= 2 && emotionalWords >= 1)) {
      dimensions.diction.vocabulary = 3; // 水平3：能表达感受与评价，使用形象词语
    } else if (adjectives >= 1 || adverbs >= 1 || descriptiveWords >= 1 || emotionalWords >= 1) {
      dimensions.diction.vocabulary = 2; // 水平2：出现描述性、具有表现力的词汇
    }
    // 水平1：默认，使用最普通的措词，几乎不使用形容词

    // 句子结构（5分制，基于《学前儿童叙事能力评定表》）
    if (complexSentences >= 3 && (compoundSentences >= 2 || prepositionalPhrases >= 2)) {
      dimensions.diction.sentenceStructure = 5; // 水平5：使用大量句子结构，灵活运用多种句式
    } else if (complexSentences >= 2 || (compoundSentences >= 2 && prepositionalPhrases >= 2)) {
      dimensions.diction.sentenceStructure = 4; // 水平4：使用两种及以上不同句式
    } else if (compoundSentences >= 2 || prepositionalPhrases >= 2) {
      dimensions.diction.sentenceStructure = 3; // 水平3：出现介词性词组和复合句
    } else if (compoundSentences >= 1 || prepositionalPhrases >= 1 || sentences.length >= 3) {
      dimensions.diction.sentenceStructure = 2; // 水平2：出现多个句子，句子之间并列
    }
    // 水平1：默认，使用简单、不连贯、并列的句子

    // ========== 语言组织维度评估 ==========
    const narrativeStructure = this.detectNarrativeStructure(text);
    const timeMarkers = this.detectTimeMarkers(text);
    const themeConsistency = this.detectThemeConsistency(text, sentences);
    const details = this.detectDetails(text);
    const expressiveness = this.detectExpressiveness(text);

    // 叙事结构（5分制，基于《学前儿童叙事能力评定表》）
    if (narrativeStructure.count >= 4) {
      dimensions.organization.narrativeStructure = 5; // 水平5：讲清楚几个行动事件及其之间的关系
    } else if (narrativeStructure.count >= 3) {
      dimensions.organization.narrativeStructure = 4; // 水平4：包含3个及以上要素
    } else if (narrativeStructure.count >= 2) {
      dimensions.organization.narrativeStructure = 3; // 水平3：围绕主题讲述几个相关行动事件并串联成故事
    }
    // 水平1：默认，包含1个要素；水平2略（有2个要素但未串联）

    // 时间标记（5分制，基于《学前儿童叙事能力评定表》）
    const complexTimeCount = countOccurrences(text, REPEATED_COMPLEX_TIME_MARKERS);
    if (timeMarkers.complex && complexTimeCount >= 3) {
      dimensions.organization.timeMarker = 5; // 水平5：灵活运用多种时间标记，时间线索完整
    } else if (timeMarkers.complex && complexTimeCount >= 2) {
      dimensions.organization.timeMarker = 4; // 水平4：连续三次使用较复杂时间标记
    } else if (timeMarkers.complex) {
      dimensions.organization.timeMarker = 3; // 水平3：使用时间副词说明事件发生时间
    } else if (timeMarkers.simple) {
      dimensions.organization.timeMarker = 2; // 水平2：使用较复杂时间标记
    }
    // 水平1：默认，仅使用简单时间连词

    // 主题贴切（5分制，基于《学前儿童叙事能力评定表》）
    if (themeConsistency >= 5) {
      dimensions.organization.themeRelevance = 5; // 水平5：很少偏离故事发展
    } else if (themeConsistency >= 4) {
      dimensions.organization.themeRelevance = 4; // 水平4：把时间联系起来构成故事线索
    } else if (themeConsistency >= 3) {
      dimensions.organization.themeRelevance = 3; // 水平3：连续超过四句话保持一致性
    } else if (themeConsistency >= 2) {
      dimensions.organization.themeRelevance = 2; // 水平2：故事线索含糊只能维持一小段
    }
    // 水平1：默认，注意力分散，故事线索断开

    // 事件扩展（5分制，基于《学前儿童叙事能力评定表》）
    if (details.hasElaboration && sentences.length >= 5) {
      dimensions.organization.eventExpansion = 5; // 水平5：对重要事件详细描述
    } else if (details.hasElaboration) {
      dimensions.organization.eventExpansion = 4; // 水平4：描述较丰富详细
    } else if (details.hasDetails && sentences.length >= 3) {
      dimensions.organization.eventExpansion = 3; // 水平3：对某些经历的特定细节加以细述
    } else if (details.hasDetails) {
      dimensions.organization.eventExpansion = 2; // 水平2：有时描述人物外貌、语言、心理活动
    }
    // 水平1：默认，描述空洞且不详细

    // 表现性（5分制，基于《学前儿童叙事能力评定表》）
    if (expressiveness.hasSoundEffects && expressiveness.hasRoleVoice) {
      dimensions.organization.expressiveness = 5; // 水平5：生动的角色语气，高度表现力的叙述
    } else if (expressiveness.hasSoundEffects) {
      dimensions.organization.expressiveness = 4; // 水平4：不断使用声音效果
    } else if (expressiveness.hasRoleVoice) {
      dimensions.organization.expressiveness = 3; // 水平3：使用角色语气、加强语气等表达形式
    }
    // 水平2（偶尔使用声音效果）和水平1（未使用或很少使用语调）通过检测细分

    // ========== 独白观点维度评估 ==========
    const opinion = this.detectOpinion(text);

    // 叙事观点（5分制，基于《学前儿童叙事能力评定表》）
    const opinionSentences = opinion.hasOpinion ? 1 : 0;
    if (opinion.hasOpinion && opinion.hasEvaluation && text.length > 100) {
      dimensions.opinion.narrativeViewpoint = 5; // 水平5：主动清晰表达观点，用"因为……"说明理由
    } else if (opinion.hasOpinion && opinion.hasEvaluation) {
      dimensions.opinion.narrativeViewpoint = 4; // 水平4：表达观点和评价来增强叙事情感色彩
    } else if (opinion.hasOpinion) {
      dimensions.opinion.narrativeViewpoint = 3; // 水平3：围绕主题较完整构思并在集体面前讲述
    } else if (opinion.hasEvaluation || opinionSentences > 0) {
      dimensions.opinion.narrativeViewpoint = 2; // 水平2：围绕主题简单构思，借助表情动作表现
    }
    // 水平1：默认，知道在集体面前讲述与日常谈话有所不同

    const confidence = 0.6;
    const reasoning = this.generateReasoning(dimensions, {
      adjectives,
      adverbs,
      descriptiveWords,
      emotionalWords,
      compoundSentences,
      complexSentences,
      prepositionalPhrases,
      narrativeStructure: narrativeStructure.count,
      timeMarkers,
      themeConsistency,
      details,
      expressiveness,
      opinion,
      sentenceCount: sentences.length,
    });

    return { dimensions, confidence, reasoning };
  }

  private async llmBasedAssessment(content: string): Promise<AssessmentResult> {
    const prompt = this.buildAssessmentPrompt(content);
    const response = await this.llmClient.complete(prompt, this.requestOptions);
    return this.parseLLMResponse(response);
  }

  private buildAssessmentPrompt(content: string): string {
    return `你是一位幼儿语言发展评估专家。请对以下大班幼儿（5-6岁）的叙事内容进行DOO三维评估。

【评估标准参考：《学前儿童叙事能力评定表》8关切点×5水平】

1. 词句维度(Diction)：

   A. 词汇水平：
      水平1（1分）：使用最普通的措词，语言简单，几乎不使用形容词。
      水平2（2分）：使用常见的动词讲述简单关系，出现一些描述性词汇描写样子或特征。
      水平3（3分）：能表达感受与评价（"我喜欢""小小的""五彩缤纷的"），使用形象词语。
      水平4（4分）：运用生活中习得的形象词语（"又粗又响""震得树叶唰唰地抖"）。
      水平5（5分）：语言清楚详细，灵活运用名词、动词、形容词、副词，常使用描述性、情感性词汇。

   B. 句子结构：
      水平1（1分）：使用简单、不连贯的句子。
      水平2（2分）：出现多个句子，句子之间是并列的。
      水平3（3分）：出现介词性词组和复合句（"在山坡上""我喜欢夏天，并且喜欢秋天"）。
      水平4（4分）：使用两种及以上不同的句式。
      水平5（5分）：使用大量句子结构，包括状语从句、定语从句、分词短语；灵活运用陈述、疑问、祈使、感叹句式。

2. 语言组织维度(Organization)：

   A. 叙事结构（背景、角色定义、事件、结局四要素）：
      水平1（1分）：包含1个要素。
      水平2（2分）：包含2个要素。
      水平3（3分）：围绕主题讲述几个相关行动事件并串联成故事。
      水平4（4分）：包含3个及以上要素。
      水平5（5分）：讲清楚几个行动事件及其之间的关系。

   B. 时间标记：
      水平1（1分）：仅使用简单时间连词（当时、然后、现在等）。
      水平2（2分）：使用较复杂时间标记（从前、后来、直到...为止、一会儿、其次）。
      水平3（3分）：使用时间副词说明事件发生时间（夜晚、第二天早晨、很多年以前）。
      水平4（4分）：连续三次使用较复杂的时间标记。
      水平5（5分）：灵活运用多种时间标记，时间线索完整清晰。

   C. 主题贴切：
      水平1（1分）：想法转换不清楚，注意力分散，故事线索断开。
      水平2（2分）：故事线索含糊且只能维持一小段，用较无关线索编成零散故事。
      水平3（3分）：连续超过四句话保持故事线索一致性和相对连续性。
      水平4（4分）：把时间联系起来，最终构成故事线索。
      水平5（5分）：很少偏离故事发展，完整连贯围绕主题展开。

   D. 事件扩展：
      水平1（1分）：描述空洞且不详细，仅简单几句话。
      水平2（2分）：有时描述人物外貌、语言、心理活动。
      水平3（3分）：对某些经历的特定细节加以细述。
      水平4（4分）：描述较丰富详细。
      水平5（5分）：对重要事件详细描述，运用五感细节、心理、对话。

   E. 表现性：
      水平1（1分）：未使用或很少使用语调，单一语调呈现故事。
      水平2（2分）：偶尔使用声音效果。
      水平3（3分）：使用角色语气、加强语气、唱歌等表达形式。
      水平4（4分）：不断使用声音效果。
      水平5（5分）：生动的角色语气，高度表现力的叙述。

3. 独白观点维度(Opinion)：

   A. 叙事观点：
      水平1（1分）：知道在集体面前讲述与日常谈话不同，愿意在集体面前讲话。
      水平2（2分）：借助凭借物围绕主题简单构思并在集体面前讲述，借助简单表情动作表现。
      水平3（3分）：围绕主题较完整构思并在集体面前讲述。
      水平4（4分）：表达自己的观点和评价来增强叙事情感色彩。
      水平5（5分）：主动清晰表达观点，用"因为……"说明理由，具备初步批判性思维。

【评分标准】5分制
  1-3分：初级，需要支持（基础水平）
  3-4分：中级，基本达成（发展水平）
  4-5分：高级，表现优秀（优秀水平）

【评分示例】

示例1（初级·水平1）：
叙事："我去了公园。看到了花。回家了。"
→ 词汇1、句型1、结构1（仅事件）、时间1、主题1（线索断开）、扩展1（空洞）、表现1（无语调）、观点1（无感受）
→ 整体得分：1分（初级，需要支持）

示例2（中级·水平3）：
叙事："昨天妈妈带我去动物园，我看到了大象和猴子。大象的耳朵很大，猴子在树上跳来跳去。我觉得很好玩。"
→ 词汇3（"很大"）、句型3（"在树上"介词短语）、结构3（时间+角色+事件）、时间2（"昨天"）、主题3、扩展3（有细节）、表现2（无拟声）、观点3（"我觉得"）
→ 整体得分：3分（中级，基本达成）

示例3（高级·水平4-5）：
叙事："从前在一个美丽的森林里，住着一只聪明的小兔子。有一天它去找好朋友小猫，它们先穿过了绿绿的草地，然后趟过了清清的小河，突然一只蝴蝶飞过来，小猫高兴地喊：哇好漂亮呀！最后它们一起开心地回家了。我觉得它们特别勇敢，因为我很喜欢小动物。"
→ 词汇5（多种形容词副词）、句型5（复合句+介词短语+状语）、结构5（四要素全+事件关系）、时间5（复杂标记连续）、主题5、扩展5、表现5（拟声+角色语气）、观点5（完整观点+理由）
→ 整体得分：5分（高级，表现优秀）

幼儿叙事内容：
"""${content}"""

请严格按照上述标准和示例评分，以JSON格式返回评估结果。

【输出纪律】你是一名儿童语言发展评估专家，只输出评分结果本身：
- reasoning 字段只描述幼儿的叙事表现和打分依据；
- 严禁提及任何与评估无关的元信息，包括：AI、模型、大模型、语言模型、提示词、prompt、输出、格式、规则、验证、测试、系统、风格等字样；
- 不要解释你的工作方式或回答要求，直接给出评分理由。
{
  "dimensions": {
    "diction": {
      "vocabulary": 1|2|3|4|5,
      "sentenceStructure": 1|2|3|4|5
    },
    "organization": {
      "narrativeStructure": 1|2|3|4|5,
      "timeMarker": 1|2|3|4|5,
      "themeRelevance": 1|2|3|4|5,
      "eventExpansion": 1|2|3|4|5,
      "expressiveness": 1|2|3|4|5
    },
    "opinion": {
      "narrativeViewpoint": 1|2|3|4|5
    }
  },
  "confidence": 0.0-1.0,
  "reasoning": "评估理由的简要说明，请引用量表（评定表）中的具体标准；只描述幼儿叙事表现与打分依据，禁止出现AI、模型、输出、格式、验证等元话语"
}`;
  }

  private parseLLMResponse(response: string): AssessmentResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const empty = DOOModel.createEmptyDimensions();
        const dims = parsed.dimensions || {};
        const org = dims.organization || {};
        // 将LLM返回的值限制在1-5范围内
        const clamp = (v: unknown): Level => {
          const n = Number(v);
          if (isNaN(n)) return 1;
          return Math.max(1, Math.min(5, Math.round(n))) as Level;
        };
        return {
          dimensions: {
            diction: {
              vocabulary: clamp(dims.diction?.vocabulary),
              sentenceStructure: clamp(dims.diction?.sentenceStructure),
            },
            organization: {
              narrativeStructure: clamp(org.narrativeStructure),
              timeMarker: clamp(org.timeMarker),
              themeRelevance: clamp(org.themeRelevance),
              eventExpansion: clamp(org.eventExpansion),
              expressiveness: clamp(org.expressiveness),
            },
            opinion: {
              narrativeViewpoint: clamp(dims.opinion?.narrativeViewpoint),
            },
          },
          confidence: parsed.confidence || 0.8,
          reasoning: parsed.reasoning || '',
        };
      }
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
    }

    return {
      dimensions: DOOModel.createEmptyDimensions(),
      confidence: 0.3,
      reasoning: 'LLM响应解析失败',
    };
  }

  private mergeAssessments(
    ruleBased: DOODimensions,
    llmBased: DOODimensions
  ): DOODimensions {
    const mergeLevel = (a: Level, b: Level): Level => {
      if (Math.abs(a - b) <= 1) {
        return Math.ceil((a + b) / 2) as Level;
      }
      return Math.max(a, b) as Level;
    };

    return {
      diction: {
        vocabulary: mergeLevel(ruleBased.diction.vocabulary, llmBased.diction.vocabulary),
        sentenceStructure: mergeLevel(
          ruleBased.diction.sentenceStructure,
          llmBased.diction.sentenceStructure
        ),
      },
      organization: {
        narrativeStructure: mergeLevel(
          ruleBased.organization.narrativeStructure,
          llmBased.organization.narrativeStructure
        ),
        timeMarker: mergeLevel(
          ruleBased.organization.timeMarker,
          llmBased.organization.timeMarker
        ),
        themeRelevance: mergeLevel(
          ruleBased.organization.themeRelevance,
          llmBased.organization.themeRelevance
        ),
        eventExpansion: mergeLevel(
          ruleBased.organization.eventExpansion,
          llmBased.organization.eventExpansion
        ),
        expressiveness: mergeLevel(
          ruleBased.organization.expressiveness,
          llmBased.organization.expressiveness
        ),
      },
      opinion: {
        narrativeViewpoint: mergeLevel(
          ruleBased.opinion.narrativeViewpoint,
          llmBased.opinion.narrativeViewpoint
        ),
      },
    };
  }

  private calculateDivergence(a: DOODimensions, b: DOODimensions): number {
    const scores = [
      Math.abs(a.diction.vocabulary - b.diction.vocabulary),
      Math.abs(a.diction.sentenceStructure - b.diction.sentenceStructure),
      Math.abs(a.organization.narrativeStructure - b.organization.narrativeStructure),
      Math.abs(a.organization.timeMarker - b.organization.timeMarker),
      Math.abs(a.organization.themeRelevance - b.organization.themeRelevance),
      Math.abs(a.organization.eventExpansion - b.organization.eventExpansion),
      Math.abs(a.organization.expressiveness - b.organization.expressiveness),
      Math.abs(a.opinion.narrativeViewpoint - b.opinion.narrativeViewpoint),
    ];
    return scores.reduce((s, v) => s + v, 0) / scores.length;
  }

  private async llmVerifyAssessment(
    content: string,
    ruleBased: DOODimensions,
    llmBased: DOODimensions
  ): Promise<AssessmentResult> {
    const prompt = `你是一位幼儿语言发展评估专家。以下是一段大班幼儿（5-6岁）的叙事内容，请你独立评估。

幼儿叙事内容：
"""${content}"""

请根据《学前儿童叙事能力评定表》对每个子维度评分（5分制：1-3分初级需要支持，3-4分中级基本达成，4-5分高级表现优秀），以JSON格式返回。

【输出纪律】只输出评分结果本身；reasoning 字段只描述幼儿的叙事表现和打分依据，严禁提及 AI、模型、大模型、提示词、输出、格式、验证等与评估无关的元信息。
{
  "dimensions": {
    "diction": {"vocabulary": 1|2|3|4|5, "sentenceStructure": 1|2|3|4|5},
    "organization": {"narrativeStructure": 1|2|3|4|5, "timeMarker": 1|2|3|4|5, "themeRelevance": 1|2|3|4|5, "eventExpansion": 1|2|3|4|5, "expressiveness": 1|2|3|4|5},
    "opinion": {"narrativeViewpoint": 1|2|3|4|5}
  },
  "confidence": 0.0-1.0,
  "reasoning": "逐项说明评分理由，只描述幼儿叙事表现与打分依据，禁止出现AI、模型、输出、格式、验证等元话语"
}`;

    try {
      const response = await this.llmClient.complete(prompt, this.requestOptions);
      return this.parseLLMResponse(response);
    } catch {
      // 验证失败，取规则和首轮LLM的较高值
      const mergeLevel = (a: Level, b: Level): Level => Math.max(a, b) as Level;
      return {
        dimensions: {
          diction: {
            vocabulary: mergeLevel(ruleBased.diction.vocabulary, llmBased.diction.vocabulary),
            sentenceStructure: mergeLevel(ruleBased.diction.sentenceStructure, llmBased.diction.sentenceStructure),
          },
          organization: {
            narrativeStructure: mergeLevel(ruleBased.organization.narrativeStructure, llmBased.organization.narrativeStructure),
            timeMarker: mergeLevel(ruleBased.organization.timeMarker, llmBased.organization.timeMarker),
            themeRelevance: mergeLevel(ruleBased.organization.themeRelevance, llmBased.organization.themeRelevance),
            eventExpansion: mergeLevel(ruleBased.organization.eventExpansion, llmBased.organization.eventExpansion),
            expressiveness: mergeLevel(ruleBased.organization.expressiveness, llmBased.organization.expressiveness),
          },
          opinion: { narrativeViewpoint: mergeLevel(ruleBased.opinion.narrativeViewpoint, llmBased.opinion.narrativeViewpoint) },
        },
        confidence: 0.7,
        reasoning: '二次验证失败，取规则与LLM评估的较高值',
      };
    }
  }

  // ========== 句子结构评估（基于《学前儿童语言学习量表》） ==========

  private countPrepositionalPhrases(sentences: string[]): number {
    // 介词性词组：在、向、对、从、为了、关于、用、以、把、被
    const prepositions = ['在', '向', '对', '从', '为了', '关于', '用', '把', '被', '跟', '和'];
    return sentences.filter(s => prepositions.some(p => s.includes(p))).length;
  }

  private countCompoundSentences(sentences: string[]): number {
    // 复合句：并列复合句和主从复合句
    const conjunctions = [
      '因为', '所以', '但是', '可是', '然后', '接着', '后来',
      '如果', '就', '虽然', '可是', '一边', '一边', '又', '又',
      '不仅', '而且', '要么', '要么', '或者', '或者',
    ];
    return sentences.filter(s => conjunctions.some(c => s.includes(c))).length;
  }

  private countComplexSentences(sentences: string[]): number {
    // 状语从句、定语从句、分词短语
    const complexMarkers = [
      '当', '的时候', '如果', '就', '因为', '所以',
      '虽然', '但是', '只要', '就', '为了',
      '正在', '已经', '过', '着',
    ];
    return sentences.filter(s => complexMarkers.some(c => s.includes(c))).length;
  }

  // ========== 叙事结构评估（基于《学前儿童语言学习量表》） ==========

  private detectNarrativeStructure(text: string): { count: number; elements: string[] } {
    // 背景、角色定义、事件、结局
    const elements: string[] = [];

    // 背景：时间、地点
    if (/有一天|从前|以前|后来|那天|今天|昨天|早上|晚上|春天|夏天|秋天|冬天/.test(text)) {
      elements.push('背景');
    }

    // 角色定义
    if (/我叫|我是|他是|她是|它是|我们|他们|大家/.test(text)) {
      elements.push('角色定义');
    }

    // 事件：动作描述
    if (/去|来|走|跑|跳|玩|看|听|说|吃|喝|做|找/.test(text)) {
      elements.push('事件');
    }

    // 结局：结果、总结
    if (/最后|终于|结果|后来|然后|结局|结束|完了/.test(text)) {
      elements.push('结局');
    }

    return { count: elements.length, elements };
  }

  // ========== 时间标记评估 ==========

  private detectTimeMarkers(text: string): { simple: boolean; complex: boolean } {
    const simple = SIMPLE_TIME_MARKERS.some(m => text.includes(m));
    const complex = COMPLEX_TIME_MARKERS.some(m => text.includes(m));

    return { simple, complex };
  }

  // ========== 主题贴切评估 ==========

  private detectThemeConsistency(text: string, sentences: string[]): number {
    // 检查故事线索的一致性和连续性（5分制）
    const topicWords = this.extractTopicWords(text);
    let consistentSentences = 0;

    for (const sentence of sentences) {
      if (topicWords.some(word => sentence.includes(word))) {
        consistentSentences++;
      }
    }

    const ratio = sentences.length > 0 ? consistentSentences / sentences.length : 0;

    if (consistentSentences >= 5 && ratio >= 0.8) {
      return 5; // 水平5：很少偏离故事发展
    } else if (consistentSentences >= 4 && ratio >= 0.7) {
      return 4; // 水平4：把时间联系起来构成故事线索
    } else if (consistentSentences >= 3 && ratio >= 0.6) {
      return 3; // 水平3：连续超过四句话保持一致性
    } else if (consistentSentences >= 2 || ratio >= 0.5) {
      return 2; // 水平2：故事线索含糊只能维持一小段
    }
    return 1; // 水平1：注意力分散，故事线索断开
  }

  private extractTopicWords(text: string): string[] {
    // 提取主题词（名词）
    const commonNouns = [
      '公园', '学校', '家', '幼儿园', '老师', '小朋友', '妈妈', '爸爸',
      '朋友', '游戏', '玩具', '动物', '花', '树', '草', '天', '地',
    ];
    return commonNouns.filter(noun => text.includes(noun));
  }

  // ========== 事件扩展评估 ==========

  private detectDetails(text: string): { hasDetails: boolean; hasElaboration: boolean } {
    const detailMarkers = ['颜色', '形状', '大小', '声音', '味道', '感觉', '看起来', '听起来', '闻起来'];
    const elaborationMarkers = [
      '有的', '有的', '一边', '一边', '首先', '然后', '接着', '最后',
      '先', '再', '又', '还',
    ];

    const hasDetails = detailMarkers.some(m => text.includes(m)) || text.length > 80;
    const hasElaboration = elaborationMarkers.some(m => text.includes(m));

    return { hasDetails, hasElaboration };
  }

  // ========== 表现性评估 ==========

  private detectExpressiveness(text: string): { hasSoundEffects: boolean; hasRoleVoice: boolean } {
    const soundEffects = ['砰', '啪', '咚', '哗', '嘀', '呜', '啊', '呀', '呢', '吧', '吗'];
    const roleVoice = ['说', '喊', '叫', '唱', '哭', '笑', '问', '回答'];

    const hasSoundEffects = soundEffects.some(s => text.includes(s));
    const hasRoleVoice = roleVoice.some(r => text.includes(r));

    return { hasSoundEffects, hasRoleVoice };
  }

  // ========== 叙事观点评估 ==========

  private detectOpinion(text: string): { hasOpinion: boolean; hasEvaluation: boolean } {
    const opinionMarkers = ['我觉得', '我认为', '我喜欢', '我不喜欢', '我想', '我希望'];
    const evaluationMarkers = [
      '真', '好', '太', '很', '非常', '特别',
      '开心', '难过', '喜欢', '讨厌', '好玩', '有趣',
    ];

    const hasOpinion = opinionMarkers.some(m => text.includes(m));
    const hasEvaluation = evaluationMarkers.some(m => text.includes(m));

    return { hasOpinion, hasEvaluation };
  }

  private generateReasoning(
    dimensions: DOODimensions,
    stats: Record<string, unknown>
  ): string {
    const parts: string[] = [];

    // 词汇水平分析
    const adjectives = stats.adjectives as number;
    const adverbs = stats.adverbs as number;
    const descriptiveWords = stats.descriptiveWords as number;
    const emotionalWords = stats.emotionalWords as number;

    if (adjectives >= 3 && adverbs >= 2 && (descriptiveWords >= 2 || emotionalWords >= 2)) {
      parts.push('使用了多种词汇，包括形容词和副词，常常使用描述性、情感性词汇，语言清楚而详细');
    } else if (adjectives >= 1 || adverbs >= 1 || descriptiveWords >= 1) {
      parts.push('出现了描述性的、具有表现力的词汇，使用了一些形容词');
    } else {
      parts.push('使用最普通的措词，语言简单，几乎不使用形容词');
    }

    // 句子结构分析
    const compoundSentences = stats.compoundSentences as number;
    const complexSentences = stats.complexSentences as number;
    const prepositionalPhrases = stats.prepositionalPhrases as number;

    if (complexSentences >= 2 || (compoundSentences >= 2 && prepositionalPhrases >= 2)) {
      parts.push('使用了大量句子结构，包括状语从句、定语从句、分词短语或几者混合使用');
    } else if (compoundSentences >= 1 || prepositionalPhrases >= 1) {
      parts.push('出现介词性词组和复合句或二者同时使用');
    } else {
      parts.push('使用简单、不连贯、并列的句子或句子成分');
    }

    // 叙事结构分析
    const narrativeStructure = stats.narrativeStructure as number;
    if (narrativeStructure >= 3) {
      parts.push('叙事包含背景、角色定义、事件、结局中的3个及以上要素');
    } else if (narrativeStructure >= 2) {
      parts.push('叙事包含背景、角色定义、事件、结局中的2个要素');
    } else {
      parts.push('叙事仅包含背景、角色定义、事件、结局中的1个要素');
    }

    // 时间标记分析
    const timeMarkers = stats.timeMarkers as { simple: boolean; complex: boolean };
    if (timeMarkers?.complex) {
      parts.push('连续使用复杂时间标记，时间逻辑清晰');
    } else if (timeMarkers?.simple) {
      parts.push('使用了简单时间连词，有一定的时间逻辑');
    } else {
      parts.push('缺乏时间标记，叙事的时间顺序不清晰');
    }

    // 主题贴切分析
    const themeConsistency = stats.themeConsistency as number;
    if (themeConsistency >= 3) {
      parts.push('连续超过四句话保持故事线索的一致性和相对连续性');
    } else if (themeConsistency >= 2) {
      parts.push('故事线索含糊且只能维持一小段');
    } else {
      parts.push('想法转换不清楚，注意力分散，故事线索断开');
    }

    // 事件扩展分析
    const details = stats.details as { hasDetails: boolean; hasElaboration: boolean };
    if (details?.hasElaboration) {
      parts.push('描述较详细，对重要的事件加以详细阐述');
    } else if (details?.hasDetails) {
      parts.push('有时对描述加以修饰，对某些经历的特定细节加以细述');
    } else {
      parts.push('描述空洞且不详细');
    }

    // 表现性分析
    const expressiveness = stats.expressiveness as { hasSoundEffects: boolean; hasRoleVoice: boolean };
    if (expressiveness?.hasSoundEffects && expressiveness?.hasRoleVoice) {
      parts.push('不断使用声音效果、生动的角色语气、高度表现力的叙述');
    } else if (expressiveness?.hasSoundEffects || expressiveness?.hasRoleVoice) {
      parts.push('偶尔使用声音效果或其他形式的表达');
    } else {
      parts.push('未使用或很少使用语调，用单一的语调呈现故事');
    }

    // 叙事观点分析
    const opinion = stats.opinion as { hasOpinion: boolean; hasEvaluation: boolean };
    if (opinion?.hasOpinion && opinion?.hasEvaluation) {
      parts.push('围绕叙事主题进行较完整的构思，表达自己的观点和评价来增强叙事的情感色彩');
    } else if (opinion?.hasOpinion || opinion?.hasEvaluation) {
      parts.push('围绕叙事主题进行简单构思，借助简单的表情、动作进行形象表现');
    } else {
      parts.push('知道在集体面前讲述与日常谈话有所不同，并愿意在集体面前讲话');
    }

    return parts.join('；') + '。';
  }
}
