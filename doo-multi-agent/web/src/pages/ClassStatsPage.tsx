import React from 'react';
import { usePortraits } from '../hooks/usePortraits';
import { calculateLevelFromScore, getLevelColor } from '../utils/levelCalculator';

// 班级ID到名称的映射
const CLASS_NAME_MAP: Record<string, string> = {
  'class_001': '大班一班',
  'class_002': '大班二班',
  'class_003': '大班三班',
  'class_004': '大班四班',
};

const ClassStatsPage: React.FC = () => {
  const { portraits, loading } = usePortraits();

  // 从真实数据计算班级统计
  const classMap = new Map<string, { count: number; totalScore: number; dictionSum: number; orgSum: number; opinionSum: number }>();

  for (const portrait of portraits) {
    const classId = portrait.classId;
    const existing = classMap.get(classId) || { count: 0, totalScore: 0, dictionSum: 0, orgSum: 0, opinionSum: 0 };
    const score = (portrait.currentRadar.diction + portrait.currentRadar.organization + portrait.currentRadar.opinion) / 3;

    classMap.set(classId, {
      count: existing.count + 1,
      totalScore: existing.totalScore + score,
      dictionSum: existing.dictionSum + portrait.currentRadar.diction,
      orgSum: existing.orgSum + portrait.currentRadar.organization,
      opinionSum: existing.opinionSum + portrait.currentRadar.opinion,
    });
  }

  const classData = Array.from(classMap.entries()).map(([classId, data]) => ({
    name: CLASS_NAME_MAP[classId] || classId,
    count: data.count,
    avgScore: data.totalScore / data.count,
    dictionAvg: data.dictionSum / data.count,
    orgAvg: data.orgSum / data.count,
    opinionAvg: data.opinionSum / data.count,
  }));

  // 得分分布 - 按5分制统一划分：<3需支持 / 3-4基本达到 / 4-5表现良好
  const levelDistribution = [
    { level: '需支持 (<3分)', count: 0, color: '#FF6B6B' },
    { level: '基本达到 (3-4分)', count: 0, color: '#FFB347' },
    { level: '表现良好 (4-5分)', count: 0, color: '#4ADE80' },
  ];

  let totalChildren = 0;
  let totalScore = 0;

  for (const portrait of portraits) {
    const score = (portrait.currentRadar.diction + portrait.currentRadar.organization + portrait.currentRadar.opinion) / 3;
    const level = calculateLevelFromScore(score);
    totalChildren++;
    totalScore += score;

    if (level < 3) levelDistribution[0].count++;
    else if (level < 4) levelDistribution[1].count++;
    else levelDistribution[2].count++;
  }

  const overallAvg = totalChildren > 0 ? (totalScore / totalChildren).toFixed(2) : '0.00';
  const maxCount = Math.max(...levelDistribution.map((d) => d.count), 1);

  // 三维度全园平均
  const dimensionAvgs = portraits.length > 0 ? {
    diction: portraits.reduce((sum, p) => sum + p.currentRadar.diction, 0) / portraits.length,
    organization: portraits.reduce((sum, p) => sum + p.currentRadar.organization, 0) / portraits.length,
    opinion: portraits.reduce((sum, p) => sum + p.currentRadar.opinion, 0) / portraits.length,
  } : { diction: 0, organization: 0, opinion: 0 };

  return (
    <div className="class-stats-page animate-fade-in-up">
      <header className="page-header">
        <h1 className="brand-font gradient-text">班级统计</h1>
        <p>查看各班级幼儿叙事能力的整体分布与发展趋势</p>
      </header>

      {loading ? (
        <div className="loading-text">加载中...</div>
      ) : portraits.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <p>暂无数据，请先进行评估</p>
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="stats-overview">
            <div className="overview-card">
              <span className="overview-icon">👶</span>
              <div className="overview-info">
                <span className="overview-value">{totalChildren}</span>
                <span className="overview-label">评估幼儿总数</span>
              </div>
            </div>
            <div className="overview-card">
              <span className="overview-icon">📊</span>
              <div className="overview-info">
                <span className="overview-value">{overallAvg}</span>
                <span className="overview-label">全园平均等级</span>
              </div>
            </div>
            <div className="overview-card">
              <span className="overview-icon">🏫</span>
              <div className="overview-info">
                <span className="overview-value">{classMap.size}</span>
                <span className="overview-label">参与班级数</span>
              </div>
            </div>
          </div>

          <div className="stats-layout">
            {/* Level Distribution */}
            <div className="stats-section">
              <h2 className="section-title brand-font">等级分布</h2>
              <div className="distribution-chart">
                {levelDistribution.map((item) => (
                  <div key={item.level} className="distribution-bar">
                    <div className="bar-label">
                      <span className="bar-color" style={{ background: item.color }} />
                      <span>{item.level}</span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${(item.count / maxCount) * 100}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                    <span className="bar-count">{item.count}人</span>
                  </div>
                ))}
              </div>

              <div className="distribution-pie">
                <svg viewBox="0 0 200 200" width="200" height="200">
                  {levelDistribution.reduce(
                    (acc, item, index) => {
                      if (item.count === 0) return acc;
                      const startAngle = acc.currentAngle;
                      const angle = (item.count / totalChildren) * 360;
                      const endAngle = startAngle + angle;

                      const startRad = ((startAngle - 90) * Math.PI) / 180;
                      const endRad = ((endAngle - 90) * Math.PI) / 180;

                      const x1 = 100 + 80 * Math.cos(startRad);
                      const y1 = 100 + 80 * Math.sin(startRad);
                      const x2 = 100 + 80 * Math.cos(endRad);
                      const y2 = 100 + 80 * Math.sin(endRad);

                      const largeArc = angle > 180 ? 1 : 0;

                      acc.paths.push(
                        <path
                          key={index}
                          d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={item.color}
                          stroke="white"
                          strokeWidth="2"
                        />
                      );
                      acc.currentAngle = endAngle;
                      return acc;
                    },
                    { paths: [] as React.ReactNode[], currentAngle: 0 }
                  ).paths}
                  <circle cx="100" cy="100" r="45" fill="white" />
                  <text x="100" y="95" textAnchor="middle" fontSize="14" fontWeight="600" fill="#2D2A4A">
                    {totalChildren}
                  </text>
                  <text x="100" y="112" textAnchor="middle" fontSize="11" fill="#6B6B8D">
                    总人数
                  </text>
                </svg>
              </div>
            </div>

            {/* Class Comparison */}
            <div className="stats-section">
              <h2 className="section-title brand-font">班级对比</h2>
              <div className="class-table-container">
                <table className="class-table">
                  <thead>
                    <tr>
                      <th>班级</th>
                      <th>人数</th>
                      <th>综合均分</th>
                      <th>词句</th>
                      <th>组织</th>
                      <th>观点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classData.map((cls) => (
                      <tr key={cls.name}>
                        <td>
                          <strong>{cls.name}</strong>
                        </td>
                        <td>{cls.count}人</td>
                        <td>
                          <span
                            className="score-badge"
                            style={{
                              background: `${getLevelColor(cls.avgScore)}20`,
                              color: getLevelColor(cls.avgScore),
                            }}
                          >
                            {cls.avgScore.toFixed(1)}
                          </span>
                        </td>
                        <td>{cls.dictionAvg.toFixed(1)}</td>
                        <td>{cls.orgAvg.toFixed(1)}</td>
                        <td>{cls.opinionAvg.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Dimension Analysis */}
          <div className="stats-section full-width">
            <h2 className="section-title brand-font">三维度分析</h2>
            <div className="dimension-analysis">
              <div className="analysis-card diction">
                <div className="analysis-header">
                  <span className="analysis-icon">📝</span>
                  <h3>词句维度</h3>
                </div>
                <div className="analysis-score">{dimensionAvgs.diction.toFixed(2)}</div>
                <p>全园平均词汇丰富度和句型复杂度处于{dimensionAvgs.diction >= 2 ? '良好' : dimensionAvgs.diction >= 1.5 ? '中等' : '初级'}水平。</p>
              </div>

              <div className="analysis-card organization">
                <div className="analysis-header">
                  <span className="analysis-icon">🧩</span>
                  <h3>组织维度</h3>
                </div>
                <div className="analysis-score">{dimensionAvgs.organization.toFixed(2)}</div>
                <p>叙事结构组织能力{dimensionAvgs.organization >= 2 ? '较好' : '有待提升'}，大部分幼儿能按时间顺序叙述事件。</p>
              </div>

              <div className="analysis-card opinion">
                <div className="analysis-header">
                  <span className="analysis-icon">💭</span>
                  <h3>观点维度</h3>
                </div>
                <div className="analysis-score">{dimensionAvgs.opinion.toFixed(2)}</div>
                <p>情感表达和观点阐述能力{dimensionAvgs.opinion >= 2 ? '良好' : '有待提升'}，建议多引导幼儿表达个人感受。</p>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .class-stats-page {
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

        .loading-text {
          text-align: center;
          padding: 60px;
          color: var(--text-light);
          font-size: 16px;
        }

        .empty-state {
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

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .stats-overview {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .overview-card {
          background: white;
          border-radius: var(--radius-lg);
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: var(--shadow-soft);
        }

        .overview-icon {
          font-size: 36px;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.1) 0%, rgba(107, 91, 149, 0.1) 100%);
          border-radius: 16px;
        }

        .overview-info {
          display: flex;
          flex-direction: column;
        }

        .overview-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .overview-label {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .stats-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
          margin-bottom: 32px;
        }

        .stats-section {
          background: white;
          border-radius: var(--radius-lg);
          padding: 28px;
          box-shadow: var(--shadow-soft);
        }

        .stats-section.full-width {
          grid-column: 1 / -1;
        }

        .section-title {
          font-size: 20px;
          margin-bottom: 20px;
          color: var(--text-primary);
        }

        .distribution-chart {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .distribution-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bar-label {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 130px;
          font-size: 13px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .bar-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }

        .bar-track {
          flex: 1;
          height: 24px;
          background: var(--bg-warm);
          border-radius: 12px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 12px;
          transition: width 0.8s ease-out;
        }

        .bar-count {
          width: 50px;
          text-align: right;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
        }

        .distribution-pie {
          display: flex;
          justify-content: center;
        }

        .class-table-container {
          overflow-x: auto;
        }

        .class-table {
          width: 100%;
          border-collapse: collapse;
        }

        .class-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 2px solid var(--border);
        }

        .class-table td {
          padding: 14px 16px;
          font-size: 14px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border);
        }

        .class-table tr:last-child td {
          border-bottom: none;
        }

        .score-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 13px;
        }

        .dimension-analysis {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .analysis-card {
          padding: 24px;
          border-radius: var(--radius-md);
          border-left: 4px solid;
        }

        .analysis-card.diction {
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.05) 0%, rgba(255, 140, 66, 0.1) 100%);
          border-left-color: #FF8C42;
        }

        .analysis-card.organization {
          background: linear-gradient(135deg, rgba(107, 91, 149, 0.05) 0%, rgba(107, 91, 149, 0.1) 100%);
          border-left-color: #6B5B95;
        }

        .analysis-card.opinion {
          background: linear-gradient(135deg, rgba(136, 216, 176, 0.05) 0%, rgba(136, 216, 176, 0.1) 100%);
          border-left-color: #88D8B0;
        }

        .analysis-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .analysis-icon {
          font-size: 22px;
        }

        .analysis-header h3 {
          font-size: 15px;
          color: var(--text-primary);
        }

        .analysis-score {
          font-size: 36px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 10px;
        }

        .analysis-card p {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-secondary);
          margin-bottom: 14px;
        }

        @media (max-width: 1024px) {
          .stats-overview {
            grid-template-columns: 1fr;
          }
          .stats-layout {
            grid-template-columns: 1fr;
          }
          .dimension-analysis {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ClassStatsPage;
