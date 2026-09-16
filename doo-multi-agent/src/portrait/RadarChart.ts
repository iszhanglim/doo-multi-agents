import { RadarData, ChildPortrait, ClassPortraitGroup } from '../core/types';

export interface RadarChartConfig {
  width?: number;
  height?: number;
  maxValue?: number;
  labels?: string[];
  colors?: {
    fill?: string;
    stroke?: string;
    grid?: string;
    text?: string;
  };
}

export class RadarChart {
  private config: Required<RadarChartConfig>;

  constructor(config: RadarChartConfig = {}) {
    this.config = {
      width: config.width || 400,
      height: config.height || 400,
      maxValue: config.maxValue || 3,
      labels: config.labels || ['词句维度', '组织维度', '观点维度'],
      colors: {
        fill: config.colors?.fill || 'rgba(54, 162, 235, 0.2)',
        stroke: config.colors?.stroke || 'rgba(54, 162, 235, 1)',
        grid: config.colors?.grid || 'rgba(200, 200, 200, 0.5)',
        text: config.colors?.text || '#666',
      },
    };
  }

  generateSVG(data: RadarData): string {
    const { width, height, maxValue, labels, colors } = this.config;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 60;

    const values = [data.diction, data.organization, data.opinion];
    const angleStep = (2 * Math.PI) / 3;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    // 背景网格
    for (let i = 1; i <= maxValue; i++) {
      const r = (radius / maxValue) * i;
      const points: string[] = [];
      for (let j = 0; j < 3; j++) {
        const angle = j * angleStep - Math.PI / 2;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        points.push(`${x},${y}`);
      }
      svg += `<polygon points="${points.join(' ')}" fill="none" stroke="${colors.grid}" stroke-width="1"/>`;
    }

    // 轴线
    for (let i = 0; i < 3; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      svg += `<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/>`;
    }

    // 数据区域
    const dataPoints: string[] = [];
    for (let i = 0; i < 3; i++) {
      const value = values[i];
      const r = (radius / maxValue) * value;
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      dataPoints.push(`${x},${y}`);
    }

    svg += `<polygon points="${dataPoints.join(' ')}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>`;

    // 数据点
    for (let i = 0; i < 3; i++) {
      const value = values[i];
      const r = (radius / maxValue) * value;
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      svg += `<circle cx="${x}" cy="${y}" r="5" fill="${colors.stroke}"/>`;
      svg += `<text x="${x}" y="${y - 10}" text-anchor="middle" fill="${colors.text}" font-size="12">${value.toFixed(1)}</text>`;
    }

    // 标签
    for (let i = 0; i < 3; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + (radius + 30) * Math.cos(angle);
      const y = centerY + (radius + 30) * Math.sin(angle);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" fill="${colors.text}" font-size="14" font-weight="bold">${labels[i]}</text>`;
    }

    // 标题
    svg += `<text x="${centerX}" y="30" text-anchor="middle" fill="${colors.text}" font-size="16" font-weight="bold">DOO叙事能力雷达图</text>`;

    svg += '</svg>';
    return svg;
  }

  generateASCII(data: RadarData): string {
    const { maxValue, labels } = this.config;
    const values = [data.diction, data.organization, data.opinion];

    const lines: string[] = [];
    lines.push('        DOO叙事能力雷达图');
    lines.push('');

    lines.push(`  ${labels[0]}: ${values[0].toFixed(1)} ${'█'.repeat(Math.round(values[0]))}`);
    lines.push(`  ${labels[1]}: ${values[1].toFixed(1)} ${'█'.repeat(Math.round(values[1]))}`);
    lines.push(`  ${labels[2]}: ${values[2].toFixed(1)} ${'█'.repeat(Math.round(values[2]))}`);
    lines.push('');

    const avg = ((values[0] + values[1] + values[2]) / 3).toFixed(1);
    lines.push(`  综合评分: ${avg} / ${maxValue}`);

    return lines.join('\n');
  }

  generateComparisonSVG(
    portraits: ChildPortrait[],
    options?: { showAverage?: boolean }
  ): string {
    const { width, height, maxValue, labels, colors } = this.config;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 60;

    const palette = [
      { fill: 'rgba(54, 162, 235, 0.2)', stroke: 'rgba(54, 162, 235, 1)' },
      { fill: 'rgba(255, 99, 132, 0.2)', stroke: 'rgba(255, 99, 132, 1)' },
      { fill: 'rgba(75, 192, 192, 0.2)', stroke: 'rgba(75, 192, 192, 1)' },
      { fill: 'rgba(255, 206, 86, 0.2)', stroke: 'rgba(255, 206, 86, 1)' },
      { fill: 'rgba(153, 102, 255, 0.2)', stroke: 'rgba(153, 102, 255, 1)' },
    ];

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    // 背景网格
    const angleStep = (2 * Math.PI) / 3;
    for (let i = 1; i <= maxValue; i++) {
      const r = (radius / maxValue) * i;
      const points: string[] = [];
      for (let j = 0; j < 3; j++) {
        const angle = j * angleStep - Math.PI / 2;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        points.push(`${x},${y}`);
      }
      svg += `<polygon points="${points.join(' ')}" fill="none" stroke="${colors.grid}" stroke-width="1"/>`;
    }

    // 轴线
    for (let i = 0; i < 3; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      svg += `<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/>`;
    }

    // 每个幼儿的数据
    portraits.forEach((portrait, index) => {
      const color = palette[index % palette.length];
      const values = [
        portrait.currentRadar.diction,
        portrait.currentRadar.organization,
        portrait.currentRadar.opinion,
      ];

      const dataPoints: string[] = [];
      for (let i = 0; i < 3; i++) {
        const value = values[i];
        const r = (radius / maxValue) * value;
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        dataPoints.push(`${x},${y}`);
      }

      svg += `<polygon points="${dataPoints.join(' ')}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2" opacity="0.7"/>`;
    });

    // 标签
    for (let i = 0; i < 3; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + (radius + 30) * Math.cos(angle);
      const y = centerY + (radius + 30) * Math.sin(angle);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" fill="${colors.text}" font-size="14" font-weight="bold">${labels[i]}</text>`;
    }

    // 标题
    svg += `<text x="${centerX}" y="30" text-anchor="middle" fill="${colors.text}" font-size="16" font-weight="bold">班级叙事能力对比图</text>`;

    // 图例
    const legendY = height - 30;
    portraits.forEach((portrait, index) => {
      const color = palette[index % palette.length];
      const legendX = 50 + index * 120;
      svg += `<rect x="${legendX}" y="${legendY - 10}" width="15" height="15" fill="${color.fill}" stroke="${color.stroke}"/>`;
      svg += `<text x="${legendX + 20}" y="${legendY}" fill="${colors.text}" font-size="12">${portrait.name}</text>`;
    });

    svg += '</svg>';
    return svg;
  }
}
