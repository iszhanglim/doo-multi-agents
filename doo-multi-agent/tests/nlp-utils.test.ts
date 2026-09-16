import {
  splitSentences,
  extractWords,
  countWordsInList,
  countPatternInText,
  ADJECTIVES,
  ADVERBS,
} from '../src/nlp/utils';
import { getScenarioLabel } from '../src/core/types';
import { AssessmentEngine } from '../src/doo/AssessmentEngine';
import { LLMClient } from '../src/nlp/LLMClient';
import { loadConfig } from '../src/config/default';

describe('NLP Utils', () => {
  describe('splitSentences', () => {
    test('should split by Chinese punctuation', () => {
      expect(splitSentences('你好。世界！')).toEqual(['你好', '世界']);
    });

    test('should split by English punctuation', () => {
      expect(splitSentences('Hello. World!')).toEqual(['Hello', 'World']);
    });

    test('should handle empty and whitespace-only input', () => {
      expect(splitSentences('')).toEqual([]);
      expect(splitSentences('   ')).toEqual([]);
    });

    test('should trim whitespace from sentences', () => {
      expect(splitSentences('  你好 。 世界 ！')).toEqual(['你好', '世界']);
    });
  });

  describe('extractWords', () => {
    test('should extract Chinese words', () => {
      const words = extractWords('小明去公园');
      expect(words).toContain('小明去公园');
    });

    test('should strip punctuation and numbers', () => {
      const words = extractWords('你好！123世界');
      expect(words.every(w => /^[一-龥a-zA-Z]+$/.test(w))).toBe(true);
    });
  });

  describe('countWordsInList', () => {
    test('should count matching words', () => {
      expect(countWordsInList(['大', '小', '跑'], ADJECTIVES)).toBe(2);
    });

    test('should return 0 for no matches', () => {
      expect(countWordsInList(['跑', '走'], ADJECTIVES)).toBe(0);
    });
  });

  describe('countPatternInText', () => {
    test('should count pattern occurrences', () => {
      expect(countPatternInText('因为A，所以B，因为C', ['因为', '所以'])).toBe(3);
    });

    test('should return 0 for no matches', () => {
      expect(countPatternInText('你好世界', ['因为', '所以'])).toBe(0);
    });
  });
});

describe('getScenarioLabel', () => {
  test('should return Chinese labels for known scenarios', () => {
    expect(getScenarioLabel('smart_story_corner')).toBe('智能故事角');
    expect(getScenarioLabel('narrative_train')).toBe('叙事火车');
    expect(getScenarioLabel('journey_podcast')).toBe('西游播客');
  });
});

describe('AssessmentEngine rule-based', () => {
  let engine: AssessmentEngine;

  beforeEach(() => {
    const config = loadConfig();
    const llmClient = new LLMClient(config.llm);
    engine = new AssessmentEngine(llmClient);
  });

  test('should assess simple narrative as level 1', async () => {
    const input = {
      childId: 'test_1',
      childName: '测试',
      classId: 'class_001',
      content: '我去公园。',
      scenario: 'smart_story_corner' as const,
      timestamp: new Date(),
    };

    // LLM will fail (no API key), so rule-based is used
    const assessment = await engine.assess(input);
    expect(assessment.overallLevel).toBe(1);
    expect(assessment.suggestions.length).toBeGreaterThan(0);
  });

  test('should assess rich narrative with higher levels', async () => {
    const input = {
      childId: 'test_2',
      childName: '测试',
      classId: 'class_001',
      content:
        '有一天早上，我和妈妈去了公园。公园里有很多漂亮的花，有红色的、黄色的，五颜六色特别好看。' +
        '突然，一只漂亮的小蝴蝶飞了过来，它慢慢地停在了花上。我觉得很开心，因为我喜欢蝴蝶。' +
        '后来，我们又看到了一只可爱的小猫，它在草地上悄悄地走来走去。最后，我们高高兴兴地回家了。',
      scenario: 'smart_story_corner' as const,
      timestamp: new Date(),
    };

    const assessment = await engine.assess(input);
    expect(assessment.dimensions.diction.vocabulary).toBeGreaterThanOrEqual(2);
    expect(assessment.dimensions.organization.narrativeStructure).toBeGreaterThanOrEqual(2);
    expect(assessment.dimensions.opinion.narrativeViewpoint).toBeGreaterThanOrEqual(2);
  });
});
