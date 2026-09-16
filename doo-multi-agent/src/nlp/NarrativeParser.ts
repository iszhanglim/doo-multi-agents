import { splitSentences, extractWords } from './utils';

export interface NarrativeElements {
  characters: string[];
  settings: string[];
  events: string[];
  emotions: string[];
  opinions: string[];
  timeline: string[];
}

export interface ParsedNarrative {
  originalText: string;
  sentences: string[];
  wordCount: number;
  sentenceCount: number;
  elements: NarrativeElements;
  hasBeginning: boolean;
  hasMiddle: boolean;
  hasEnd: boolean;
  hasConflict: boolean;
  hasResolution: boolean;
}

export class NarrativeParser {
  parse(text: string): ParsedNarrative {
    const sentences = this.splitSentences(text);
    const words = this.extractWords(text);
    const elements = this.extractElements(text, sentences);

    return {
      originalText: text,
      sentences,
      wordCount: words.length,
      sentenceCount: sentences.length,
      elements,
      hasBeginning: this.detectBeginning(text),
      hasMiddle: this.detectMiddle(text),
      hasEnd: this.detectEnd(text),
      hasConflict: this.detectConflict(text),
      hasResolution: this.detectResolution(text),
    };
  }

  private splitSentences(text: string): string[] {
    return splitSentences(text);
  }

  private extractWords(text: string): string[] {
    return extractWords(text);
  }

  private extractElements(text: string, sentences: string[]): NarrativeElements {
    return {
      characters: this.extractCharacters(text),
      settings: this.extractSettings(text),
      events: this.extractEvents(text),
      emotions: this.extractEmotions(text),
      opinions: this.extractOpinions(text),
      timeline: this.extractTimeline(text),
    };
  }

  private extractCharacters(text: string): string[] {
    const characterPatterns = [
      /([小][\u4e00-\u9fa5]{1,2})[朋友|朋友|孩]/g,
      /([\u4e00-\u9fa5]{1,3})[和|跟|与]/g,
    ];
    const characters: string[] = [];
    for (const pattern of characterPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        characters.push(...matches.map(m => m.replace(/[和跟与]/g, '').trim()));
      }
    }
    return [...new Set(characters)];
  }

  private extractSettings(text: string): string[] {
    const settingKeywords = [
      '幼儿园', '家里', '公园', '学校', '操场', '教室', '图书馆',
      '山上', '河边', '森林', '城市', '乡村', '海边',
    ];
    return settingKeywords.filter(keyword => text.includes(keyword));
  }

  private extractEvents(text: string): string[] {
    const eventKeywords = [
      '玩', '去', '来', '走', '跑', '跳', '吃', '喝', '看', '听',
      '说', '笑', '哭', '打', '拿', '给', '找', '做',
    ];
    const events: string[] = [];
    for (const keyword of eventKeywords) {
      if (text.includes(keyword)) {
        events.push(keyword);
      }
    }
    return [...new Set(events)];
  }

  private extractEmotions(text: string): string[] {
    const emotionKeywords = [
      '开心', '高兴', '快乐', '难过', '伤心', '害怕', '紧张',
      '兴奋', '生气', '愤怒', '喜欢', '讨厌', '爱',
    ];
    return emotionKeywords.filter(keyword => text.includes(keyword));
  }

  private extractOpinions(text: string): string[] {
    const opinionPatterns = [
      /我觉得[\u4e00-\u9fa5]+/g,
      /我喜欢[\u4e00-\u9fa5]+/g,
      /我认为[\u4e00-\u9fa5]+/g,
      /我想[\u4e00-\u9fa5]+/g,
    ];
    const opinions: string[] = [];
    for (const pattern of opinionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        opinions.push(...matches);
      }
    }
    return opinions;
  }

  private extractTimeline(text: string): string[] {
    const timelineKeywords = [
      '早上', '中午', '晚上', '昨天', '今天', '明天',
      '先', '然后', '接着', '后来', '最后', '开始', '结束',
    ];
    return timelineKeywords.filter(keyword => text.includes(keyword));
  }

  private detectBeginning(text: string): boolean {
    const beginningMarkers = ['从前', '有一天', '早上', '开始', '首先', '昨天'];
    return beginningMarkers.some(marker => text.includes(marker));
  }

  private detectMiddle(text: string): boolean {
    const middleMarkers = ['然后', '接着', '后来', '突然', '这时候'];
    return middleMarkers.some(marker => text.includes(marker));
  }

  private detectEnd(text: string): boolean {
    const endMarkers = ['最后', '终于', '结束', '后来', '完了'];
    return endMarkers.some(marker => text.includes(marker));
  }

  private detectConflict(text: string): boolean {
    const conflictMarkers = ['但是', '可是', '不过', '没想到', '突然'];
    return conflictMarkers.some(marker => text.includes(marker));
  }

  private detectResolution(text: string): boolean {
    const resolutionMarkers = ['最后', '终于', '所以', '于是', '然后'];
    return resolutionMarkers.some(marker => text.includes(marker));
  }
}
