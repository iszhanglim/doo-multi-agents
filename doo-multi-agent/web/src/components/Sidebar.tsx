import React from 'react';
import { useAuth } from '../context/AuthContext';

type Page = 'dashboard' | 'assess' | 'portraits' | 'class-stats' | 'profile' | 'admin-users';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const menuItems: { id: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: '首页', icon: '🏠' },
  { id: 'assess', label: '叙事评估', icon: '📝' },
  { id: 'portraits', label: '幼儿画像', icon: '👶' },
  { id: 'class-stats', label: '班级统计', icon: '📊' },
  { id: 'profile', label: '个人中心', icon: '👤' },
  { id: 'admin-users', label: '教师管理', icon: '⚙️', adminOnly: true },
];

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">🎯</span>
          <div className="logo-text">
            <h2 className="brand-font">DOO智能体</h2>
            <span className="logo-subtitle">叙事能力评估</span>
          </div>
        </div>
      </div>

      {user && (
        <div className="user-info">
          <span className="user-avatar">{user.avatar || '👤'}</span>
          <div className="user-details">
            <span className="user-name">{user.name}</span>
            <span className="user-role">{user.role === 'admin' ? '管理员' : '教师'}</span>
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {menuItems
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {currentPage === item.id && <span className="nav-indicator" />}
            </button>
          ))}
      </nav>

      <div className="sidebar-footer">
        <div className="agent-status">
          <div className="agent-item">
            <span className="agent-dot active" />
            <span className="agent-name">D博士</span>
            <span className="agent-role">专家</span>
          </div>
          <div className="agent-item">
            <span className="agent-dot active" />
            <span className="agent-name">小欧老师</span>
            <span className="agent-role">助教</span>
          </div>
          <div className="agent-item">
            <span className="agent-dot active" />
            <span className="agent-name">多多</span>
            <span className="agent-role">同伴</span>
          </div>
        </div>

        <button className="logout-btn" onClick={logout}>
          <span>🚪</span>
          <span>退出登录</span>
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 260px;
          height: 100vh;
          background: linear-gradient(180deg, #2D2A4A 0%, #1E1B3A 100%);
          color: white;
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 100;
          padding: 24px 16px;
        }

        .sidebar-header {
          margin-bottom: 20px;
          padding: 0 8px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 32px;
          animation: float 3s ease-in-out infinite;
        }

        .logo-text h2 {
          font-size: 20px;
          color: var(--primary);
          margin: 0;
          line-height: 1.2;
        }

        .logo-subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 1px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .user-avatar {
          font-size: 24px;
        }

        .user-details {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
        }

        .user-role {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          font-family: inherit;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.08);
          color: white;
        }

        .nav-item.active {
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.2) 0%, rgba(107, 91, 149, 0.2) 100%);
          color: white;
        }

        .nav-icon {
          font-size: 20px;
          width: 28px;
          text-align: center;
        }

        .nav-indicator {
          position: absolute;
          right: 12px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--primary);
        }

        .sidebar-footer {
          margin-top: auto;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .agent-status {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }

        .agent-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .agent-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
        }

        .agent-dot.active {
          background: #4ADE80;
          box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
        }

        .agent-name {
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
        }

        .agent-role {
          color: rgba(255, 255, 255, 0.4);
          font-size: 11px;
          margin-left: auto;
        }

        .logout-btn {
          width: 100%;
          padding: 10px;
          background: rgba(255, 255, 255, 0.08);
          border: none;
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .logout-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: white;
        }

        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
          }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
