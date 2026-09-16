import React, { useState } from 'react';
import RadarChart from '../components/RadarChart';
import { usePortraits } from '../hooks/usePortraits';
import { useAuth } from '../context/AuthContext';
import { calculateLevelFromDimensions, getLevelColor } from '../utils/levelCalculator';
import type { ChildPortrait, DOOAssessment } from '../types';

const CLASS_NAME_MAP: Record<string, string> = {
  'class_001': '大班一班',
  'class_002': '大班二班',
  'class_003': '大班三班',
  'class_004': '大班四班',
};

const SCENARIO_MAP: Record<string, string> = {
  'smart_story_corner': '🎨 智能故事角',
  'narrative_train': '🚂 叙事火车',
  'journey_podcast': '🎭 西游播客',
};

const LEVEL_LABELS: Record<number, string> = {
  1: '初级·需支持',
  2: '初级·需支持',
  3: '中级·基本达成',
  4: '高级·表现优秀',
  5: '高级·表现优秀',
};

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: '处于初级发展阶段（1-3分），需要更多支架支持。建议从简单的词汇和句型开始，逐步引导幼儿完整叙述事件。',
  2: '处于初级发展阶段（1-3分），在词句运用和叙事组织方面需加强支持。建议多进行词汇丰富度和叙事顺序的引导。',
  3: '处于中级发展水平（3-4分），基本达成当前阶段的叙事要求。建议巩固已有能力，并尝试更丰富的词汇和更完整的叙事结构。',
  4: '处于高级发展水平（4-5分），表现优秀。叙事结构完整，能够清晰表达个人感受和观点。建议继续保持，并挑战更复杂的叙事内容。',
  5: '处于高级发展水平（4-5分），表现优秀。叙事结构完整，能够清晰表达个人感受和观点。建议继续保持，并挑战更复杂的叙事内容。',
};

const DIMENSION_DETAILS = {
  diction: {
    name: '词句维度',
    icon: '📝',
    color: '#FF8C42',
    subDimensions: [
      { key: 'vocabulary', name: '词汇水平', description: '形容词、副词、描述性词汇的使用丰富度' },
      { key: 'sentenceStructure', name: '句子结构', description: '简单句、复合句、复杂句的使用情况' },
    ],
  },
  organization: {
    name: '组织维度',
    icon: '🧩',
    color: '#6B5B95',
    subDimensions: [
      { key: 'narrativeStructure', name: '叙事结构', description: '背景、角色定义、事件、结局的完整性' },
      { key: 'timeMarker', name: '时间标记', description: '时间连词和时间逻辑的使用情况' },
      { key: 'themeRelevance', name: '主题贴切', description: '故事线索的一致性和连续性' },
      { key: 'eventExpansion', name: '事件扩展', description: '细节描述的丰富程度和重要事件的阐述' },
      { key: 'expressiveness', name: '表现性', description: '声音效果、角色语气、表现力叙述的使用' },
    ],
  },
  opinion: {
    name: '观点维度',
    icon: '💭',
    color: '#88D8B0',
    subDimensions: [
      { key: 'narrativeViewpoint', name: '叙事观点', description: '个人感受、观点和评价的表达能力' },
    ],
  },
};

const PortraitPage: React.FC = () => {
  const { user } = useAuth();
  const { portraits, loading, deletePortrait } = usePortraits();
  const [selectedChild, setSelectedChild] = useState<ChildPortrait | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const filteredPortraits = portraits.filter((p) =>
    p.name?.includes(searchTerm) || p.childId?.includes(searchTerm)
  );

  const getOverallScore = (radar: ChildPortrait['currentRadar']) => {
    return ((radar.diction + radar.organization + radar.opinion) / 3).toFixed(1);
  };



  const canDelete = (portrait: ChildPortrait) => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'teacher' && user?.classId === portrait.classId) return true;
    return false;
  };

  const handleDelete = async (childId: string) => {
    if (!window.confirm('确定要删除该幼儿的画像吗？此操作不可恢复。')) return;
    setDeleting(true);
    const success = await deletePortrait(childId);
    if (success) {
      if (selectedChild?.childId === childId) {
        setSelectedChild(null);
      }
    }
    setDeleting(false);
  };

  const generatePortraitHTML = (portrait: ChildPortrait): string => {
    const overallScore = getOverallScore(portrait.currentRadar);
    const level = Math.round(parseFloat(overallScore));
    const assessments = portrait.basePortrait?.assessments || [];
    const latestAssessment = assessments[assessments.length - 1];
    const calcLevel = (dims: DOOAssessment['dimensions']) => {
      const d = (dims.diction.vocabulary + dims.diction.sentenceStructure) / 2;
      const o = (dims.organization.narrativeStructure + dims.organization.timeMarker + dims.organization.themeRelevance + dims.organization.eventExpansion + dims.organization.expressiveness) / 5;
      const op = dims.opinion.narrativeViewpoint;
      const avg = (d + o + op) / 3;
      if (avg >= 2.5) return 3;
      if (avg >= 1.5) return 2;
      return 1;
    };

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>DOO幼儿画像报告 - ${portrait.name || '未命名'}</title>
  <style>
    body { font-family: 'Segoe UI', 'PingFang SC', sans-serif; margin: 40px; color: #333; line-height: 1.8; }
    .header { text-align: center; border-bottom: 3px solid #FF8C42; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #2D2A4A; margin: 0; font-size: 28px; }
    .header p { color: #666; margin: 10px 0 0; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .info-item { background: #f8f9fa; padding: 15px; border-radius: 8px; }
    .info-label { font-size: 12px; color: #888; font-weight: 600; }
    .info-value { font-size: 16px; color: #333; font-weight: 700; margin-top: 5px; }
    .section { margin-bottom: 30px; }
    .section h2 { color: #2D2A4A; border-left: 4px solid #FF8C42; padding-left: 15px; font-size: 20px; }
    .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
    .score-card { background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 20px; border-radius: 10px; text-align: center; }
    .score-name { font-size: 14px; color: #666; }
    .score-value { font-size: 32px; font-weight: 700; color: #FF8C42; margin: 10px 0; }
    .dimension-detail { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
    .dimension-name { font-weight: 600; color: #2D2A4A; }
    .dimension-score { color: #FF8C42; font-weight: 700; }
    .assessment-item { border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 15px; }
    .assessment-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .content-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; font-style: italic; }
    .suggestion-list { list-style: none; padding: 0; }
    .suggestion-list li { padding: 10px; background: #fff3cd; border-radius: 6px; margin-bottom: 8px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #e9ecef; color: #888; font-size: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 DOO 幼儿叙事能力画像报告</h1>
    <p>基于《学前儿童语言学习量表》的专业评估</p>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">幼儿姓名</div>
      <div class="info-value">${portrait.name || '未命名'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">所属班级</div>
      <div class="info-value">${CLASS_NAME_MAP[portrait.classId] || portrait.classId}</div>
    </div>
    <div class="info-item">
      <div class="info-label">评估次数</div>
      <div class="info-value">${assessments.length} 次</div>
    </div>
  </div>

  <div class="section">
    <h2>综合评估</h2>
    <div class="score-grid">
      <div class="score-card">
        <div class="score-name">综合评分</div>
        <div class="score-value" style="color: ${getLevelColor(parseFloat(overallScore))}">${overallScore}</div>
      </div>
      <div class="score-card">
        <div class="score-name">发展等级</div>
        <div class="score-value" style="color: ${getLevelColor(parseFloat(overallScore))}">等级 ${level}</div>
      </div>
      <div class="score-card">
        <div class="score-name">发展状态</div>
        <div class="score-value" style="color: ${getLevelColor(parseFloat(overallScore))}; font-size: 18px;">${LEVEL_LABELS[level] || '未知'}</div>
      </div>
    </div>
    <p>${LEVEL_DESCRIPTIONS[level] || ''}</p>
  </div>

  <div class="section">
    <h2>三维度详细分析</h2>
    ${Object.entries(DIMENSION_DETAILS).map(([dimKey, dimInfo]) => {
      const dimScore = portrait.currentRadar[dimKey as keyof typeof portrait.currentRadar];
      const dimData = latestAssessment?.dimensions[dimKey as keyof typeof latestAssessment.dimensions];
      return `
        <div class="dimension-detail">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span class="dimension-name">${dimInfo.icon} ${dimInfo.name}</span>
            <span class="dimension-score">${dimScore.toFixed(1)} 分</span>
          </div>
          ${dimInfo.subDimensions.map(sub => {
            const subScore = dimData?.[sub.key as keyof typeof dimData] || 1;
            return `
              <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #ddd;">
                <span>${sub.name}：${sub.description}</span>
                <span style="color: ${getLevelColor(subScore)}; font-weight: 600;">${subScore} 级</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}
  </div>

  <div class="section">
    <h2>评估历史</h2>
    ${assessments.map((assessment, index) => `
      <div class="assessment-item">
        <div class="assessment-header">
          <strong>第 ${index + 1} 次评估</strong>
          <span>${assessment.timestamp ? new Date(assessment.timestamp).toLocaleString('zh-CN') : '未知时间'}</span>
        </div>
        <div><strong>评估场景：</strong>${SCENARIO_MAP[assessment.scenario || ''] || '智能故事角'}</div>
        <div class="content-box">${assessment.narrativeContent || '无内容记录'}</div>
        <div><strong>综合等级：</strong>等级 ${calcLevel(assessment.dimensions)} · ${LEVEL_LABELS[calcLevel(assessment.dimensions)] || '未知'}</div>
        ${assessment.suggestions && assessment.suggestions.length > 0 ? `
          <div style="margin-top: 10px;">
            <strong>发展建议：</strong>
            <ul class="suggestion-list">
              ${assessment.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `).join('')}
  </div>

  <div class="footer">
    <p>报告生成时间：${new Date().toLocaleString('zh-CN')}</p>
    <p>评估系统：DOO多智能体系统 | D博士·小欧老师·多多 协同评估</p>
    <p>参考标准：《学前儿童语言学习量表》</p>
  </div>
</body>
</html>
    `;
  };

  const handleExportPDF = () => {
    if (!selectedChild) return;
    const html = generatePortraitHTML(selectedChild);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.document.title = `DOO画像报告_${selectedChild.name || '未命名'}`;
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
  };

  const handlePrint = () => {
    if (!selectedChild) return;
    const html = generatePortraitHTML(selectedChild);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const getSubDimensionScore = (assessment: DOOAssessment | undefined, dimension: string, subKey: string): number => {
    if (!assessment) return 1;
    const dim = assessment.dimensions[dimension as keyof typeof assessment.dimensions];
    if (!dim) return 1;
    return (dim as Record<string, number>)[subKey] || 1;
  };

  return (
    <div className="portrait-page animate-fade-in-up">
      <header className="page-header">
        <h1 className="brand-font gradient-text">幼儿画像</h1>
        <p>查看每位幼儿的叙事能力发展画像与雷达图</p>
      </header>

      <div className="portrait-layout">
        {/* Children List */}
        <div className="children-list-container">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="input-field"
              placeholder="搜索幼儿姓名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="loading-text">加载中...</div>
          ) : (
            <div className="children-grid">
              {filteredPortraits.map((child) => {
                const score = parseFloat(getOverallScore(child.currentRadar));
                return (
                  <div
                    key={child.childId}
                    className={`child-card ${selectedChild?.childId === child.childId ? 'active' : ''}`}
                  >
                    <button
                      className="child-card-main"
                      onClick={() => setSelectedChild(child)}
                    >
                      <div className="child-avatar">
                        {child.name?.[0] || '?'}
                      </div>
                      <div className="child-info">
                        <span className="child-name">{child.name || '未命名'}</span>
                        <span className="child-score">
                          综合: <strong style={{ color: getLevelColor(score) }}>{score}</strong>
                        </span>
                      </div>
                      <div
                        className="child-level-dot"
                        style={{ background: getLevelColor(score) }}
                      />
                    </button>
                    {canDelete(child) && (
                      <button
                        className="child-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(child.childId);
                        }}
                        disabled={deleting}
                        title="删除画像"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Portrait Detail */}
        {selectedChild ? (
          <div className="portrait-detail">
            {/* 头部信息 */}
            <div className="detail-header">
              <div className="detail-avatar">
                {selectedChild.name?.[0] || '?'}
              </div>
              <div className="detail-info">
                <h2>{selectedChild.name || '未命名'}</h2>
                <span className="detail-meta">
                  班级: {CLASS_NAME_MAP[selectedChild.classId] || selectedChild.classId} · 
                  评估次数: {selectedChild.basePortrait?.assessments?.length || 0} 次
                </span>
              </div>
              <div className="detail-actions">
                <button className="btn-export" onClick={handleExportPDF}>
                  📄 导出PDF
                </button>
                <button className="btn-print" onClick={handlePrint}>
                  🖨️ 打印报告
                </button>
              </div>
            </div>

            {/* 综合评分 */}
            <div className="overall-section">
              <div className="overall-score-card">
                <span className="overall-label">综合评分</span>
                <span className="overall-score" style={{ color: getLevelColor(parseFloat(getOverallScore(selectedChild.currentRadar))) }}>
                  {getOverallScore(selectedChild.currentRadar)}
                </span>
                <span className="overall-level">
                  等级 {Math.round(parseFloat(getOverallScore(selectedChild.currentRadar)))} · {LEVEL_LABELS[Math.round(parseFloat(getOverallScore(selectedChild.currentRadar)))] || '未知'}
                </span>
              </div>
              <div className="overall-description">
                {LEVEL_DESCRIPTIONS[Math.round(parseFloat(getOverallScore(selectedChild.currentRadar)))] || ''}
              </div>
            </div>

            {/* 雷达图 */}
            <div className="detail-radar">
              <RadarChart data={selectedChild.currentRadar} size={320} />
            </div>

            {/* 三维度详细分析 */}
            <div className="detail-dimensions">
              <h3>📊 三维度详细分析</h3>
              {Object.entries(DIMENSION_DETAILS).map(([dimKey, dimInfo]) => {
                const dimScore = selectedChild.currentRadar[dimKey as keyof typeof selectedChild.currentRadar];
                const latestAssessment = selectedChild.basePortrait?.assessments?.[selectedChild.basePortrait.assessments.length - 1];
                return (
                  <div key={dimKey} className="dimension-section">
                    <div className="dimension-header">
                      <span className="dimension-icon">{dimInfo.icon}</span>
                      <span className="dimension-name">{dimInfo.name}</span>
                      <span className="dimension-score" style={{ color: dimInfo.color }}>
                        {dimScore.toFixed(1)} 分
                      </span>
                    </div>
                    <div className="sub-dimensions">
                      {dimInfo.subDimensions.map((sub) => {
                        const subScore = getSubDimensionScore(latestAssessment, dimKey, sub.key);
                        return (
                          <div key={sub.key} className="sub-dimension-item">
                            <div className="sub-dim-info">
                              <span className="sub-dim-name">{sub.name}</span>
                              <span className="sub-dim-desc">{sub.description}</span>
                            </div>
                            <div className="sub-dim-score-bar">
                              <div 
                                className="sub-dim-progress" 
                                style={{ 
                                  width: `${(subScore / 3) * 100}%`, 
                                  background: getLevelColor(subScore) 
                                }}
                              />
                              <span className="sub-dim-score-value" style={{ color: getLevelColor(subScore) }}>
                                {subScore} 级
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 评估历史 */}
            {selectedChild.basePortrait?.assessments && selectedChild.basePortrait.assessments.length > 0 && (
              <div className="detail-history">
                <h3>📋 评估历史记录</h3>
                <div className="history-list">
                  {selectedChild.basePortrait.assessments.map((assessment, index) => (
                    <div key={assessment.id || index} className="history-item">
                      <div className="history-header">
                        <span className="history-index">第 {index + 1} 次评估</span>
                        <span className="history-date">
                          {assessment.timestamp ? new Date(assessment.timestamp).toLocaleString('zh-CN') : '未知时间'}
                        </span>
                      </div>

                      <div className="history-info-grid">
                            <div className="history-info-item">
                              <span className="info-label">评估场景</span>
                              <span className="info-value">
                                {SCENARIO_MAP[assessment.scenario || ''] || '🎨 智能故事角'}
                              </span>
                            </div>
                            <div className="history-info-item">
                              <span className="info-label">综合等级</span>
                              <span className="info-value" style={{ color: getLevelColor(calculateLevelFromDimensions(assessment.dimensions)) }}>
                                等级 {calculateLevelFromDimensions(assessment.dimensions)} · {LEVEL_LABELS[calculateLevelFromDimensions(assessment.dimensions)] || '未知'}
                              </span>
                            </div>
                          </div>

                          <div className="history-content">
                            <span className="content-label">叙事内容</span>
                            <p className="content-text">{assessment.narrativeContent || '无内容记录'}</p>
                          </div>

                          {/* 详细维度得分 */}
                          <div className="history-dimensions">
                            <div className="history-dim-row">
                              <span>词句维度</span>
                              <div className="dim-bars">
                                <span>词汇:{assessment.dimensions.diction.vocabulary}</span>
                                <span>句型:{assessment.dimensions.diction.sentenceStructure}</span>
                              </div>
                            </div>
                            <div className="history-dim-row">
                              <span>组织维度</span>
                              <div className="dim-bars">
                                <span>结构:{assessment.dimensions.organization.narrativeStructure}</span>
                                <span>主题:{assessment.dimensions.organization.themeRelevance}</span>
                                <span>扩展:{assessment.dimensions.organization.eventExpansion}</span>
                                <span>表现:{assessment.dimensions.organization.expressiveness}</span>
                              </div>
                            </div>
                            <div className="history-dim-row">
                              <span>观点维度</span>
                              <div className="dim-bars">
                                <span>观点:{assessment.dimensions.opinion.narrativeViewpoint}</span>
                              </div>
                            </div>
                          </div>

                          {/* 评估分析 */}
                          {assessment.suggestions && assessment.suggestions.length > 0 && (
                            <div className="history-suggestions">
                              <span className="suggestions-label">评估分析与建议</span>
                              <ul className="suggestions-list">
                                {assessment.suggestions.map((suggestion, sIndex) => (
                                  <li key={sIndex}>{suggestion}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="portrait-placeholder">
            <span className="placeholder-icon">👶</span>
            <p>{portraits.length > 0 ? '选择左侧幼儿查看详细画像' : '暂无幼儿画像数据'}</p>
          </div>
        )}
      </div>

      <style>{`
        .portrait-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .page-header h1 {
          font-size: 28px;
          margin-bottom: 8px;
        }

        .page-header p {
          color: var(--text-secondary);
          font-size: 15px;
        }

        .portrait-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 28px;
          align-items: start;
        }

        .children-list-container {
          position: sticky;
          top: 32px;
        }

        .search-box {
          position: relative;
          margin-bottom: 16px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          z-index: 1;
        }

        .search-box input {
          padding-left: 42px;
        }

        .loading-text {
          text-align: center;
          padding: 40px;
          color: var(--text-light);
        }

        .children-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .child-card {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 16px;
          background: white;
          border: 2px solid transparent;
          border-radius: var(--radius-md);
          transition: all 0.3s ease;
        }

        .child-card:hover {
          border-color: var(--primary-light);
          transform: translateX(4px);
        }

        .child-card.active {
          border-color: var(--primary);
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.05) 0%, rgba(107, 91, 149, 0.05) 100%);
        }

        .child-card-main {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          padding: 0;
        }

        .child-delete-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: #FEE2E2;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .child-delete-btn:hover {
          background: #FECACA;
          transform: scale(1.1);
        }

        .child-delete-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .child-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary-light), var(--secondary-light));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 16px;
          flex-shrink: 0;
        }

        .child-info {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .child-name {
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
        }

        .child-score {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .child-level-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .portrait-detail {
          background: white;
          border-radius: var(--radius-lg);
          padding: 32px;
          box-shadow: var(--shadow-soft);
          animation: fadeInUp 0.5s ease-out;
        }

        .detail-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 2px solid var(--border);
        }

        .detail-avatar {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 24px;
        }

        .detail-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-info h2 {
          font-size: 22px;
          color: var(--text-primary);
        }

        .detail-meta {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .detail-actions {
          display: flex;
          gap: 10px;
        }

        .btn-export, .btn-print {
          padding: 10px 18px;
          border-radius: var(--radius-md);
          border: none;
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .btn-export {
          background: linear-gradient(135deg, var(--primary-light), var(--secondary-light));
          color: white;
        }

        .btn-export:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255, 140, 66, 0.3);
        }

        .btn-print {
          background: var(--bg-warm);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }

        .btn-print:hover {
          background: var(--border);
        }

        .overall-section {
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.05) 0%, rgba(107, 91, 149, 0.05) 100%);
          border-radius: var(--radius-lg);
          padding: 24px;
          margin-bottom: 24px;
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 24px;
          align-items: center;
        }

        .overall-score-card {
          text-align: center;
          padding: 20px;
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-soft);
        }

        .overall-label {
          display: block;
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .overall-score {
          display: block;
          font-size: 48px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 8px;
        }

        .overall-level {
          display: block;
          font-size: 14px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .overall-description {
          font-size: 15px;
          line-height: 1.8;
          color: var(--text-secondary);
        }

        .detail-radar {
          display: flex;
          justify-content: center;
          padding: 20px 0;
          margin-bottom: 24px;
        }

        .detail-dimensions h3 {
          font-size: 18px;
          margin-bottom: 20px;
          color: var(--text-primary);
          padding-bottom: 10px;
          border-bottom: 2px solid var(--border);
        }

        .dimension-section {
          background: var(--bg-warm);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin-bottom: 16px;
        }

        .dimension-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .dimension-icon {
          font-size: 24px;
        }

        .dimension-name {
          flex: 1;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .dimension-score {
          font-size: 20px;
          font-weight: 700;
        }

        .sub-dimensions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sub-dimension-item {
          background: white;
          border-radius: var(--radius-md);
          padding: 14px 16px;
        }

        .sub-dim-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .sub-dim-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
        }

        .sub-dim-desc {
          font-size: 12px;
          color: var(--text-light);
          margin-left: 8px;
        }

        .sub-dim-score-bar {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .sub-dim-progress {
          flex: 1;
          height: 8px;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .sub-dim-score-value {
          font-size: 14px;
          font-weight: 600;
          min-width: 40px;
          text-align: right;
        }

        .detail-history {
          margin-top: 32px;
        }

        .detail-history h3 {
          font-size: 18px;
          margin-bottom: 20px;
          color: var(--text-primary);
          padding-bottom: 10px;
          border-bottom: 2px solid var(--border);
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .history-item {
          background: var(--bg-warm);
          border-radius: var(--radius-lg);
          padding: 24px;
          border-left: 4px solid var(--secondary);
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .history-index {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .history-date {
          font-size: 13px;
          color: var(--text-light);
        }

        .history-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .history-info-item {
          background: white;
          padding: 12px;
          border-radius: var(--radius-sm);
        }

        .history-info-item .info-label {
          display: block;
          font-size: 12px;
          color: var(--text-light);
          margin-bottom: 4px;
        }

        .history-info-item .info-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .history-content {
          margin-bottom: 16px;
        }

        .content-label {
          display: block;
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 600;
          margin-bottom: 8px;
        }

        .content-text {
          font-size: 14px;
          line-height: 1.8;
          color: var(--text-secondary);
          padding: 14px;
          background: white;
          border-radius: var(--radius-md);
          margin: 0;
        }

        .history-dimensions {
          background: white;
          border-radius: var(--radius-md);
          padding: 14px;
          margin-bottom: 16px;
        }

        .history-dim-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px dashed var(--border);
        }

        .history-dim-row:last-child {
          border-bottom: none;
        }

        .dim-bars {
          display: flex;
          gap: 12px;
        }

        .dim-bars span {
          font-size: 12px;
          padding: 4px 10px;
          background: var(--bg-warm);
          border-radius: 12px;
          color: var(--text-secondary);
        }

        .history-suggestions {
          background: white;
          border-radius: var(--radius-md);
          padding: 16px;
        }

        .suggestions-label {
          display: block;
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 600;
          margin-bottom: 10px;
        }

        .suggestions-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .suggestions-list li {
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.08) 0%, rgba(107, 91, 149, 0.08) 100%);
          border-radius: var(--radius-sm);
          margin-bottom: 8px;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        .suggestions-list li:last-child {
          margin-bottom: 0;
        }

        .portrait-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-soft);
          color: var(--text-light);
        }

        .placeholder-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        @media (max-width: 1024px) {
          .portrait-layout {
            grid-template-columns: 1fr;
          }
          .children-list-container {
            position: static;
          }
          .children-grid {
            flex-direction: row;
            flex-wrap: wrap;
          }
          .child-card {
            flex: 1;
            min-width: 140px;
          }
          .overall-section {
            grid-template-columns: 1fr;
          }
          .history-info-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default PortraitPage;
