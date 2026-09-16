import React from 'react';
import { useStats } from '../hooks/useStats';
import { useActivities } from '../hooks/useActivities';

type Page = 'dashboard' | 'assess' | 'portraits' | 'class-stats';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { stats, loading } = useStats();
  const { activities, loading: activitiesLoading } = useActivities();

  const statsData = [
    {
      label: '已评估幼儿',
      value: stats?.totalChildren ?? 0,
      icon: '👶',
      color: '#FF8C42',
    },
    {
      label: '今日评估',
      value: stats?.todayCount ?? 0,
      icon: '📝',
      color: '#6B5B95',
    },
    {
      label: '班级数量',
      value: stats?.classCount ?? 0,
      icon: '🏫',
      color: '#88D8B0',
    },
    {
      label: '平均等级',
      value: stats?.avgLevel?.toFixed(1) ?? '0.0',
      icon: '📈',
      color: '#FF6B6B',
    },
  ];

  const quickActions = [
    { label: '开始评估', icon: '📝', page: 'assess' as Page, desc: '输入幼儿叙事内容进行DOO评估' },
    { label: '查看画像', icon: '👶', page: 'portraits' as Page, desc: '浏览幼儿个人叙事能力画像' },
    { label: '班级统计', icon: '📊', page: 'class-stats' as Page, desc: '查看班级整体叙事能力分布' },
  ];

  return (
    <div className="dashboard animate-fade-in-up">
      <header className="dashboard-header">
        <div>
          <h1 className="brand-font gradient-text">欢迎使用 DOO 多智能体系统</h1>
          <p className="dashboard-subtitle">基于DOO模型的大班幼儿叙事能力评估与个性化支持</p>
        </div>
        <div className="date-badge">
          <span>📅</span>
          <span>{new Date().toLocaleDateString('zh-CN')}</span>
        </div>
      </header>

      {/* Stats Cards */}
      <section className="stats-grid">
        {statsData.map((stat, index) => (
          <div
            key={stat.label}
            className="stat-card"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="stat-icon" style={{ background: `${stat.color}20`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-info">
              <span className="stat-value" style={{ color: stat.color }}>
                {loading ? '...' : stat.value}
              </span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Quick Actions */}
      <section className="quick-actions">
        <h2 className="section-title brand-font">快速操作</h2>
        <div className="actions-grid">
          {quickActions.map((action) => (
            <button
              key={action.label}
              className="action-card"
              onClick={() => onNavigate(action.page)}
            >
              <span className="action-icon">{action.icon}</span>
              <h3>{action.label}</h3>
              <p>{action.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="recent-activity">
        <h2 className="section-title brand-font">最近动态</h2>
        <div className="activity-list">
          {activitiesLoading ? (
            <div className="loading-text">加载中...</div>
          ) : activities.length === 0 ? (
            <div className="empty-text">暂无动态</div>
          ) : (
            activities.map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-avatar">
                  {activity.child[0]}
                </div>
                <div className="activity-content">
                  <div className="activity-header">
                    <span className="activity-child">{activity.child}</span>
                    <span className="activity-action">{activity.action}</span>
                  </div>
                  <div className="activity-meta">
                    <span className="activity-time">{activity.time}</span>
                    <span className={`activity-level level-${activity.level}`}>
                      等级 {activity.level}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* DOO Model Info */}
      <section className="doo-info">
        <h2 className="section-title brand-font">DOO 评估模型</h2>
        <div className="doo-cards">
          <div className="doo-card diction">
            <div className="doo-card-header">
              <span className="doo-icon">📝</span>
              <h3>词句维度 Diction</h3>
            </div>
            <ul>
              <li>词汇丰富度</li>
              <li>句型复杂度</li>
            </ul>
          </div>
          <div className="doo-card organization">
            <div className="doo-card-header">
              <span className="doo-icon">🧩</span>
              <h3>组织维度 Organization</h3>
            </div>
            <ul>
              <li>叙事结构</li>
              <li>主题关联</li>
              <li>事件扩展</li>
              <li>表现力</li>
            </ul>
          </div>
          <div className="doo-card opinion">
            <div className="doo-card-header">
              <span className="doo-icon">💭</span>
              <h3>观点维度 Opinion</h3>
            </div>
            <ul>
              <li>叙事观点</li>
              <li>情感表达</li>
            </ul>
          </div>
        </div>
      </section>

      <style>{`
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
        }

        .dashboard-header h1 {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .dashboard-subtitle {
          color: var(--text-secondary);
          font-size: 15px;
        }

        .date-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-soft);
          font-size: 14px;
          color: var(--text-secondary);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border-radius: var(--radius-lg);
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: var(--shadow-soft);
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }

        .stat-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          line-height: 1.2;
        }

        .stat-label {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .section-title {
          font-size: 22px;
          margin-bottom: 20px;
          color: var(--text-primary);
        }

        .quick-actions {
          margin-bottom: 32px;
        }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .action-card {
          background: white;
          border: 2px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 28px;
          text-align: left;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .action-card:hover {
          border-color: var(--primary);
          transform: translateY(-4px);
          box-shadow: var(--shadow-medium);
        }

        .action-icon {
          font-size: 36px;
          display: block;
          margin-bottom: 12px;
        }

        .action-card h3 {
          font-size: 17px;
          margin-bottom: 6px;
          color: var(--text-primary);
        }

        .action-card p {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .recent-activity {
          margin-bottom: 32px;
        }

        .activity-list {
          background: white;
          border-radius: var(--radius-lg);
          padding: 8px;
          box-shadow: var(--shadow-soft);
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: var(--radius-md);
          transition: background 0.2s ease;
        }

        .activity-item:hover {
          background: var(--bg-warm);
        }

        .activity-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary-light), var(--secondary-light));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
        }

        .activity-content {
          flex: 1;
        }

        .activity-header {
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
        }

        .activity-child {
          font-weight: 600;
          color: var(--text-primary);
        }

        .activity-action {
          color: var(--text-secondary);
        }

        .activity-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
        }

        .activity-time {
          color: var(--text-light);
        }

        .activity-level {
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
          font-size: 11px;
        }

        .level-1 { background: #FEE2E2; color: #DC2626; }
        .level-2 { background: #FEF3C7; color: #D97706; }
        .level-3 { background: #D1FAE5; color: #059669; }

        .doo-info {
          margin-bottom: 32px;
        }

        .doo-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .doo-card {
          background: white;
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-soft);
          border-top: 4px solid;
        }

        .doo-card.diction { border-top-color: #FF8C42; }
        .doo-card.organization { border-top-color: #6B5B95; }
        .doo-card.opinion { border-top-color: #88D8B0; }

        .doo-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .doo-icon {
          font-size: 24px;
        }

        .doo-card h3 {
          font-size: 16px;
          color: var(--text-primary);
        }

        .doo-card ul {
          list-style: none;
          padding: 0;
        }

        .doo-card li {
          padding: 6px 0;
          color: var(--text-secondary);
          font-size: 14px;
          position: relative;
          padding-left: 16px;
        }

        .doo-card li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: var(--primary);
          font-weight: bold;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .actions-grid,
          .doo-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
