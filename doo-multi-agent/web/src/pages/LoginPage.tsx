import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onLogin: () => void;
}

const CLASSES = [
  { id: 'class_001', name: '大班一班' },
  { id: 'class_002', name: '大班二班' },
  { id: 'class_003', name: '大班三班' },
  { id: 'class_004', name: '大班四班' },
];

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('class_001');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isRegister) {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          setLoading(false);
          return;
        }
        const result = await register(username, password, name, classId);
        if (result.success) {
          setSuccess('注册成功！请登录');
          setIsRegister(false);
          setPassword('');
          setConfirmPassword('');
        } else {
          setError(result.message);
        }
      } else {
        const success = await login(username, password);
        if (success) {
          onLogin();
        } else {
          setError('用户名或密码错误');
        }
      }
    } catch {
      setError(isRegister ? '注册失败，请重试' : '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError('');
    setSuccess('');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <span className="brand-icon">🎯</span>
          <h1 className="brand-font">DOO 多智能体系统</h1>
          <p>幼儿叙事能力评估平台</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              className="input-field"
              placeholder={isRegister ? '请输入用户名（至少3个字符）' : '请输入用户名'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label>姓名</label>
              <input
                type="text"
                className="input-field"
                placeholder="请输入您的姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          {isRegister && (
            <div className="form-group">
              <label>所属班级</label>
              <select
                className="input-field"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {CLASSES.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              className="input-field"
              placeholder={isRegister ? '请输入密码（至少6个字符）' : '请输入密码'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label>确认密码</label>
              <input
                type="password"
                className="input-field"
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? (isRegister ? '注册中...' : '登录中...') : (isRegister ? '注 册' : '登 录')}
          </button>
        </form>

        <div className="login-toggle">
          <button type="button" className="toggle-btn" onClick={toggleMode}>
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>

        {!isRegister && (
          <div className="login-hint">
            <p>测试账号:</p>
            <code>teacher1 / 123456</code>
            <code>teacher2 / 123456</code>
            <code>admin / admin</code>
          </div>
        )}
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2D2A4A 0%, #1E1B3A 50%, #2D2A4A 100%);
          padding: 20px;
        }

        .login-container {
          width: 100%;
          max-width: 420px;
          background: white;
          border-radius: var(--radius-xl);
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .login-brand {
          text-align: center;
          margin-bottom: 32px;
        }

        .brand-icon {
          font-size: 56px;
          display: block;
          margin-bottom: 12px;
          animation: float 3s ease-in-out infinite;
        }

        .login-brand h1 {
          font-size: 26px;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .login-brand p {
          color: var(--text-secondary);
          font-size: 14px;
        }

        .login-form {
          margin-bottom: 20px;
        }

        .login-form .form-group {
          margin-bottom: 18px;
        }

        .login-form label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .login-error {
          padding: 10px 14px;
          background: #FEE2E2;
          color: #DC2626;
          border-radius: var(--radius-sm);
          font-size: 13px;
          margin-bottom: 16px;
        }

        .login-success {
          padding: 10px 14px;
          background: #D1FAE5;
          color: #059669;
          border-radius: var(--radius-sm);
          font-size: 13px;
          margin-bottom: 16px;
        }

        .login-btn {
          width: 100%;
          padding: 14px;
          font-size: 16px;
        }

        .login-toggle {
          text-align: center;
          margin-bottom: 20px;
        }

        .toggle-btn {
          background: none;
          border: none;
          color: var(--primary);
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          font-family: inherit;
        }

        .toggle-btn:hover {
          color: var(--primary-dark);
        }

        .login-hint {
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .login-hint p {
          font-size: 12px;
          color: var(--text-light);
          margin-bottom: 8px;
        }

        .login-hint code {
          display: inline-block;
          padding: 4px 10px;
          background: var(--bg-warm);
          border-radius: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          margin: 2px;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
