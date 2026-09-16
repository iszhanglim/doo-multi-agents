import type { DOOAssessment } from '../types';

/**
 * 根据DOO三维度子项得分计算综合得分
 * 8个观测点总分平均，四舍五入到最近的1-5分
 */
export function calculateLevelFromDimensions(dimensions: DOOAssessment['dimensions']): number {
  const scores = [
    dimensions.diction.vocabulary, dimensions.diction.sentenceStructure,
    dimensions.organization.narrativeStructure, dimensions.organization.timeMarker,
    dimensions.organization.themeRelevance, dimensions.organization.eventExpansion,
    dimensions.organization.expressiveness, dimensions.opinion.narrativeViewpoint,
  ];
  const average = scores.reduce((s, v) => s + v, 0) / 8;
  return Math.max(1, Math.min(5, Math.round(average)));
}

/**
 * 根据综合评分计算等级（四舍五入到最近的1-5分）
 */
export function calculateLevelFromScore(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * 等级标签映射（5分制）
 */
export const LEVEL_LABELS: Record<number, string> = {
  1: '初级·需支持',
  2: '初级·需支持',
  3: '中级·基本达成',
  4: '高级·表现优秀',
  5: '高级·表现优秀',
};

/**
 * 等级颜色映射（5分制）
 */
export function getLevelColor(score: number): string {
  if (score < 3) return '#FF6B6B';
  if (score < 4) return '#FFB347';
  return '#4ADE80';
}

/**
 * 渲染星星（1分点亮1颗，满分5颗）
 */
export function renderStars(score: number, size = 16): string {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));
  const full = '★'.repeat(rounded);
  const empty = '☆'.repeat(5 - rounded);
  return `<span style="color:#FFB800;font-size:${size}px;letter-spacing:2px;">${full}${empty}</span>`;
}
