import {
  splitSentences,
  extractWords,
  countWordsInList,
  countPatternInText,
  ADJECTIVES,
  ADVERBS,
  COMMON_NOUNS,
  VERBS,
} from './utils';

export interface NarrativeFeatures {
  lexical: {
    wordCount: number;
    uniqueWordCount: number;
    lexicalDiversity: number;
    adjectiveCount: number;
    adverbCount: number;
    nounCount: number;
    verbCount: number;
  };
  syntactic: {
    sentenceCount: number;
    averageSentenceLength: number;
    complexSentenceCount: number;
    complexSentenceRatio: number;
    questionCount: number;
    exclamationCount: number;
  };
  discourse: {
    hasBeginning: boolean;
    hasMiddle: boolean;
    hasEnd: boolean;
    hasConflict: boolean;
    hasResolution: boolean;
    temporalMarkers: number;
    causalMarkers: number;
    additiveMarkers: number;
  };
  semantic: {
    emotionWords: number;
    sensoryWords: number;
    cognitiveWords: number;
    opinionExpressions: number;
  };
}

export class FeatureExtractor {
  extract(text: string): NarrativeFeatures {
    const sentences = this.splitSentences(text);
    const words = this.extractWords(text);

    return {
      lexical: this.extractLexicalFeatures(words),
      syntactic: this.extractSyntacticFeatures(sentences, words),
      discourse: this.extractDiscourseFeatures(text, sentences),
      semantic: this.extractSemanticFeatures(text),
    };
  }

  private splitSentences(text: string): string[] {
    return splitSentences(text);
  }

  private extractWords(text: string): string[] {
    return extractWords(text);
  }

  private extractLexicalFeatures(words: string[]): NarrativeFeatures['lexical'] {
    const uniqueWords = [...new Set(words)];

    return {
      wordCount: words.length,
      uniqueWordCount: uniqueWords.length,
      lexicalDiversity: words.length > 0 ? uniqueWords.length / words.length : 0,
      adjectiveCount: this.countAdjectives(words),
      adverbCount: this.countAdverbs(words),
      nounCount: this.countNouns(words),
      verbCount: this.countVerbs(words),
    };
  }

  private extractSyntacticFeatures(
    sentences: string[],
    words: string[]
  ): NarrativeFeatures['syntactic'] {
    const totalLength = sentences.reduce((sum, s) => sum + s.length, 0);

    return {
      sentenceCount: sentences.length,
      averageSentenceLength: sentences.length > 0 ? totalLength / sentences.length : 0,
      complexSentenceCount: this.countComplexSentences(sentences),
      complexSentenceRatio:
        sentences.length > 0 ? this.countComplexSentences(sentences) / sentences.length : 0,
      questionCount: this.countQuestions(sentences),
      exclamationCount: this.countExclamations(sentences),
    };
  }

  private extractDiscourseFeatures(
    text: string,
    sentences: string[]
  ): NarrativeFeatures['discourse'] {
    return {
      hasBeginning: this.detectBeginning(text),
      hasMiddle: this.detectMiddle(text),
      hasEnd: this.detectEnd(text),
      hasConflict: this.detectConflict(text),
      hasResolution: this.detectResolution(text),
      temporalMarkers: this.countTemporalMarkers(text),
      causalMarkers: this.countCausalMarkers(text),
      additiveMarkers: this.countAdditiveMarkers(text),
    };
  }

  private extractSemanticFeatures(text: string): NarrativeFeatures['semantic'] {
    return {
      emotionWords: this.countEmotionWords(text),
      sensoryWords: this.countSensoryWords(text),
      cognitiveWords: this.countCognitiveWords(text),
      opinionExpressions: this.countOpinionExpressions(text),
    };
  }

  private countAdjectives(words: string[]): number {
    return countWordsInList(words, ADJECTIVES);
  }

  private countAdverbs(words: string[]): number {
    return countWordsInList(words, ADVERBS);
  }

  private countNouns(words: string[]): number {
    return countWordsInList(words, COMMON_NOUNS);
  }

  private countVerbs(words: string[]): number {
    return countWordsInList(words, VERBS);
  }

  private countComplexSentences(sentences: string[]): number {
    const conjunctions = ['因为', '所以', '但是', '然后', '接着', '后来', '如果', '虽然'];
    return sentences.filter(s => conjunctions.some(c => s.includes(c))).length;
  }

  private countQuestions(sentences: string[]): number {
    return sentences.filter(s => s.includes('?') || s.includes('？') || s.includes('吗') || s.includes('呢')).length;
  }

  private countExclamations(sentences: string[]): number {
    return sentences.filter(s => s.includes('!') || s.includes('！')).length;
  }

  private detectBeginning(text: string): boolean {
    const markers = ['从前', '有一天', '早上', '开始', '首先', '昨天', '今天'];
    return markers.some(m => text.includes(m));
  }

  private detectMiddle(text: string): boolean {
    const markers = ['然后', '接着', '后来', '突然', '这时候', '正在'];
    return markers.some(m => text.includes(m));
  }

  private detectEnd(text: string): boolean {
    const markers = ['最后', '终于', '结束', '完了', '后来'];
    return markers.some(m => text.includes(m));
  }

  private detectConflict(text: string): boolean {
    const markers = ['但是', '可是', '不过', '没想到', '突然'];
    return markers.some(m => text.includes(m));
  }

  private detectResolution(text: string): boolean {
    const markers = ['最后', '终于', '所以', '于是', '然后'];
    return markers.some(m => text.includes(m));
  }

  private countTemporalMarkers(text: string): number {
    return countPatternInText(text, ['先', '然后', '接着', '后来', '最后', '早上', '中午', '晚上', '昨天', '今天']);
  }

  private countCausalMarkers(text: string): number {
    return countPatternInText(text, ['因为', '所以', '于是', '因此', '结果']);
  }

  private countAdditiveMarkers(text: string): number {
    return countPatternInText(text, ['和', '还有', '另外', '而且', '也', '又']);
  }

  private countEmotionWords(text: string): number {
    return countPatternInText(text, ['开心', '高兴', '快乐', '难过', '伤心', '害怕', '紧张', '兴奋', '生气']);
  }

  private countSensoryWords(text: string): number {
    return countPatternInText(text, ['看', '听', '闻', '摸', '吃', '颜色', '声音', '味道', '感觉']);
  }

  private countCognitiveWords(text: string): number {
    return countPatternInText(text, ['想', '觉得', '认为', '知道', '记得', '发现', '明白']);
  }

  private countOpinionExpressions(text: string): number {
    return countPatternInText(text, ['我觉得', '我喜欢', '我认为', '我想', '我希望']);
  }
}
