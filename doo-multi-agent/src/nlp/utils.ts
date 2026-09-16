/**
 * Common Chinese NLP utilities shared across the system.
 * Single source of truth for sentence splitting, word extraction,
 * and lightweight keyword counting.
 */

// ========== Text segmentation ==========

export function splitSentences(text: string): string[] {
  return text
    .split(/[。！？.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function extractWords(text: string): string[] {
  return text
    .replace(/[^一-龥a-zA-Z]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

// ========== Vocabulary helpers ==========

export const ADJECTIVES: readonly string[] = [
  '大', '小', '高', '矮', '长', '短', '红', '绿', '蓝', '黄', '白', '黑',
  '漂亮', '好看', '美丽', '可爱', '帅气', '干净', '整齐',
  '高兴', '开心', '快乐', '难过', '伤心', '害怕', '勇敢', '生气',
  '聪明', '调皮', '乖巧', '听话', '捣蛋',
  '大大的', '小小的', '高高的', '矮矮的', '红红的', '绿绿的', '蓝蓝的',
  '圆圆的', '方方的', '弯弯的', '直直的',
  '香喷喷', '亮晶晶', '软绵绵', '硬邦邦', '滑溜溜',
  '慢慢地', '轻轻地', '快快地', '悄悄地', '偷偷地',
];

export const ADVERBS: readonly string[] = [
  '很', '非常', '特别', '十分', '最', '太', '真', '好', '多么',
  '慢慢', '快快地', '轻轻地', '大声地', '悄悄地', '偷偷地',
  '突然', '终于', '忽然', '立刻', '马上', '一直', '总是',
  '也', '还', '又', '再', '都', '全',
];

export const DESCRIPTIVE_WORDS: readonly string[] = [
  '香喷喷', '亮晶晶', '软绵绵', '硬邦邦', '滑溜溜',
  '金灿灿', '绿油油', '红彤彤', '白花花', '黑乎乎',
  '圆溜溜', '胖乎乎', '瘦巴巴', '亮堂堂', '暗沉沉',
  '弯弯曲曲', '整整齐齐', '干干净净', '漂漂亮亮',
  '慢慢地', '轻轻地', '快快地', '悄悄地', '偷偷地',
  '高高兴兴', '开开心心', '快快乐乐', '干干净净',
];

export const EMOTIONAL_WORDS: readonly string[] = [
  '开心', '快乐', '高兴', '兴奋', '激动', '惊喜',
  '难过', '伤心', '失望', '委屈', '害怕', '紧张',
  '喜欢', '爱', '讨厌', '恨', '羡慕', '嫉妒',
  '自豪', '骄傲', '害羞', '惭愧', '感激', '感动',
  '幸福', '满足', '舒服', '痛快', '得意',
];

export const COMMON_NOUNS: readonly string[] = [
  '人', '小朋友', '老师', '妈妈', '爸爸', '朋友', '孩子', '宝宝',
  '动物', '花', '树', '草', '天', '地', '山', '水', '河', '海',
  '公园', '学校', '家', '幼儿园', '操场', '教室', '房子',
  '玩具', '游戏', '故事', '书', '画', '歌', '糖', '饭',
  '猫', '狗', '鸟', '鱼', '兔子', '大象', '猴子',
  '太阳', '月亮', '星星', '云', '风', '雨', '雪',
];

export const VERBS: readonly string[] = [
  '玩', '去', '来', '走', '跑', '跳', '吃', '喝', '看', '听',
  '说', '笑', '哭', '打', '拿', '给', '找', '做', '睡', '醒',
];

// ========== Counting helpers ==========

export function countWordsInList(words: string[], list: readonly string[]): number {
  const text = words.join('');
  return list.filter(w => text.includes(w)).length;
}

export function countPatternInText(text: string, patterns: readonly string[]): number {
  return patterns.reduce((count, p) => count + (text.split(p).length - 1), 0);
}
