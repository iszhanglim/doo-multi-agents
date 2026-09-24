/**
 * LLM 输出清洗工具（P0-2 修复）。
 *
 * 背景：评估建议（suggestions）与报告文本会直接展示给教师，
 * 但 LLM 偶尔会在面向用户的文本中混入关于任务/格式/验证过程的
 * 元话语（如"输出风格""内容已验证"等）。本模块提供句级清洗：
 *  - 生成侧：AssessmentEngine 对 LLM reasoning 的即时清洗；
 *  - 读取侧：Web 服务端在返回 suggestions / report 前的兜底清洗
 *    （可覆盖历史已落库数据，无需数据迁移脚本）。
 */

/** 匹配"关于输出任务自身"的元话语关键词。刻意保守，避免误伤正常评语。 */
const META_PATTERNS: RegExp =
  /(输出风格|内容已验证|为便于验证|便于验证|验证通过|作为(?:一个)?(?:AI|人工智能|模型|语言模型|助手)|AI(?:模型|助手|评估)|语言模型|大模型|提示词|prompt|格式要求|按(?:照)?(?:上述|以上)?(?:要求|格式|规则)(?:输出|生成|作答))/i;

/** 匹配文本开头的【...】注释块（如"【综合评语……】"）。 */
const LEADING_BRACKET = /^【[^】]{0,120}】\s*/;

/**
 * 剥离文本中的元话语句子与开头注释块。
 * 句级过滤：仅移除包含元话语的句子；多句全部命中时保留原文兜底；
 * 整段即单句且命中元话语时返回空字符串（调用方应跳过空结果）。
 */
export function sanitizeMetaText(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  const stripped = text.replace(LEADING_BRACKET, '');
  const sentences = stripped
    .split(/(?<=[。！？；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    const single = stripped.trim();
    return META_PATTERNS.test(single) ? '' : single;
  }
  const kept = sentences.filter((s) => !META_PATTERNS.test(s));
  return (kept.length > 0 ? kept : sentences).join('').trim();
}

/** 清洗字符串数组（如 suggestions）。非字符串元素原样保留；空结果会被移除。 */
export function sanitizeMetaList<T>(list: T[]): T[] {
  if (!Array.isArray(list)) return list;
  return list
    .map((item) =>
      typeof item === 'string' ? (sanitizeMetaText(item) as unknown as T) : item,
    )
    .filter((item) => !(typeof item === 'string' && item === ''));
}
