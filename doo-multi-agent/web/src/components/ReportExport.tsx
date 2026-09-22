import React, { useState } from 'react';
import type { DOOAssessment } from '../types';

interface ReportExportProps {
  childName: string;
  assessment: DOOAssessment;
}

/**
 * HTML 转义。
 * 报告 HTML 会通过 `document.write` 注入到新窗口，其中含幼儿姓名（用户输入）
 * 与 LLM 生成的建议文本，未转义即构成 XSS。
 */
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const ReportExport: React.FC<ReportExportProps> = ({ childName, assessment }) => {
  const [exporting, setExporting] = useState(false);

  const calculateLevelFromDimensions = (dimensions: DOOAssessment['dimensions']): number => {
    const scores = [
      dimensions.diction.vocabulary, dimensions.diction.sentenceStructure,
      dimensions.organization.narrativeStructure, dimensions.organization.timeMarker,
      dimensions.organization.themeRelevance, dimensions.organization.eventExpansion,
      dimensions.organization.expressiveness, dimensions.opinion.narrativeViewpoint,
    ];
    const average = scores.reduce((s, v) => s + v, 0) / 8;
    return Math.max(1, Math.min(5, Math.round(average)));
  };

  const renderStars = (level: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(level)));
    const full = '★'.repeat(rounded);
    const empty = '☆'.repeat(5 - rounded);
    return `<span style="color:#FFB800;font-size:28px;letter-spacing:4px;">${full}${empty}</span>`;
  };

  const generateReportHTML = () => {
    const date = new Date().toLocaleDateString('zh-CN');
    const level = calculateLevelFromDimensions(assessment.dimensions);
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>DOO叙事能力评估报告 - ${escapeHtml(childName)}</title>
  <style>
    body { font-family: 'Noto Sans SC', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #2D2A4A; }
    .header { text-align: center; border-bottom: 3px solid #FF8C42; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #FF8C42; margin-bottom: 8px; }
    .info { background: #FFF8F0; padding: 20px; border-radius: 12px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; margin: 8px 0; }
    .score-card { background: linear-gradient(135deg, #FF8C42, #6B5B95); color: white; padding: 24px; border-radius: 16px; text-align: center; margin-bottom: 24px; }
    .score-value { font-size: 48px; font-weight: 700; }
    .dimension { margin-bottom: 20px; padding: 16px; background: #f8f8f8; border-radius: 12px; }
    .dimension h3 { color: #6B5B95; margin-bottom: 12px; }
    .bar { height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; margin: 8px 0; }
    .bar-fill { height: 100%; border-radius: 10px; }
    .suggestions { background: #FFF8F0; padding: 20px; border-radius: 12px; }
    .suggestions li { margin: 10px 0; color: #555; }
    .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 DOO 叙事能力评估报告</h1>
    <p>基于多智能体协同评估系统</p>
  </div>
  
  <div class="info">
    <div class="info-row"><strong>幼儿姓名:</strong> <span>${escapeHtml(childName)}</span></div>
    <div class="info-row"><strong>评估日期:</strong> <span>${date}</span></div>
    <div class="info-row"><strong>评估场景:</strong> <span>智能故事角</span></div>
  </div>

  <div class="score-card">
    <div style="font-size: 20px; margin-bottom: 8px;">综合评分</div>
    <div class="score-value">${level}分</div>
    <div style="margin-top: 8px;">${renderStars(level)}</div>
  </div>

  <div class="dimension">
    <h3>📝 词句维度</h3>
    <p>词汇丰富度: ${assessment.dimensions.diction.vocabulary}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.diction.vocabulary / 5) * 100}%; background: #FF8C42;"></div></div>
    <p>句型复杂度: ${assessment.dimensions.diction.sentenceStructure}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.diction.sentenceStructure / 5) * 100}%; background: #FF8C42;"></div></div>
  </div>

  <div class="dimension">
    <h3>🧩 组织维度</h3>
    <p>叙事结构: ${assessment.dimensions.organization.narrativeStructure}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.organization.narrativeStructure / 5) * 100}%; background: #6B5B95;"></div></div>
    <p>时间标记: ${assessment.dimensions.organization.timeMarker}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.organization.timeMarker / 5) * 100}%; background: #6B5B95;"></div></div>
    <p>主题关联: ${assessment.dimensions.organization.themeRelevance}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.organization.themeRelevance / 5) * 100}%; background: #6B5B95;"></div></div>
    <p>事件扩展: ${assessment.dimensions.organization.eventExpansion}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.organization.eventExpansion / 5) * 100}%; background: #6B5B95;"></div></div>
    <p>表现性: ${assessment.dimensions.organization.expressiveness}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.organization.expressiveness / 5) * 100}%; background: #6B5B95;"></div></div>
  </div>

  <div class="dimension">
    <h3>💭 观点维度</h3>
    <p>叙事观点: ${assessment.dimensions.opinion.narrativeViewpoint}/5</p>
    <div class="bar"><div class="bar-fill" style="width: ${(assessment.dimensions.opinion.narrativeViewpoint / 5) * 100}%; background: #88D8B0;"></div></div>
  </div>

  <div class="suggestions">
    <h3>💡 发展建议</h3>
    <ul>
      ${assessment.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>
  </div>

  <div class="footer">
    <p>本报告由 DOO 多智能体系统自动生成</p>
    <p>D博士 · 小欧老师 · 多多 协同评估</p>
  </div>
</body>
</html>`;
  };

  const handleExportPDF = () => {
    setExporting(true);
    const html = generateReportHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.document.title = `DOO评估报告_${childName}`;
        const style = printWindow.document.createElement('style');
        style.textContent = `
          @media print {
            @page { size: A4; margin: 15mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `;
        printWindow.document.head.appendChild(style);
        printWindow.print();
        printWindow.close();
      }, 800);
    }
    setExporting(false);
  };

  const handlePrint = () => {
    const html = generateReportHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="report-export">
      <h3>📄 导出报告</h3>
      <div className="export-actions">
        <button className="btn-secondary" onClick={handleExportPDF} disabled={exporting}>
          {exporting ? '导出中...' : '📄 导出PDF'}
        </button>
        <button className="btn-secondary" onClick={handlePrint}>
          🖨️ 打印报告
        </button>
      </div>

      <style>{`
        .report-export {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .report-export h3 {
          font-size: 16px;
          margin-bottom: 14px;
          color: var(--text-primary);
        }

        .export-actions {
          display: flex;
          gap: 12px;
        }
      `}</style>
    </div>
  );
};

export default ReportExport;
