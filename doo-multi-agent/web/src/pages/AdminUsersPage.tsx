import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const CLASSES = [
  { id: 'class_001', name: '大班一班' },
  { id: 'class_002', name: '大班二班' },
  { id: 'class_003', name: '大班三班' },
  { id: 'class_004', name: '大班四班' },
];

const CLASS_NAME_MAP: Record<string, string> = {
  'class_001': '大班一班',
  'class_002': '大班二班',
  'class_003': '大班三班',
  'class_004': '大班四班',
};

const AVATARS = ['👩‍🏫', '👨‍🏫', '👩‍🎓', '👨‍🎓', '👩‍💼', '👨‍💼', '👩‍🔬', '👨‍🔬', '👩‍🎨', '👨‍🎨'];

const AdminUsersPage: React.FC = () => {
  const { user, getAllUsers, adminDeleteUser, adminResetPassword, adminUpdateUser, register } = useAuth();
  const [allUsers, setAllUsers] = useState<Array<{ username: string; user: { id: string; name: string; role: string; classId?: string; avatar?: string } }>>([]);

  useEffect(() => {
    getAllUsers().then(setAllUsers);
  }, [getAllUsers]);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    classId: 'class_001',
    avatar: '👩‍🏫',
  });
  const [addForm, setAddForm] = useState({
    username: '',
    password: '',
    name: '',
    classId: 'class_001',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshUsers = () => { getAllUsers().then(setAllUsers); };

  if (user?.role !== 'admin') {
    return (
      <div className="admin-page">
        <div className="error-state">⚠️ 您没有权限访问此页面</div>
      </div>
    );
  }

  const handleDelete = async (username: string) => {
    if (!window.confirm(`确定要删除老师 "${username}" 吗？此操作不可恢复。`)) return;
    const success = await adminDeleteUser(username);
    if (success) {
      setMessage(`老师 "${username}" 已删除`);
      refreshUsers();
      setTimeout(() => setMessage(''), 3000);
    } else {
      setError('删除失败');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleResetPassword = async (username: string) => {
    if (!newPassword || newPassword.length < 6) {
      setError('密码至少6个字符');
      setTimeout(() => setError(''), 3000);
      return;
    }
    const success = await adminResetPassword(username, newPassword);
    if (success) {
      setMessage(`老师 "${username}" 密码已重置`);
      setNewPassword('');
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } else {
      setError('重置密码失败');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const result = await register(addForm.username, addForm.password, addForm.name, addForm.classId);
    if (result.success) {
      setMessage('老师添加成功');
      setShowAddModal(false);
      refreshUsers();
      setAddForm({ username: '', password: '', name: '', classId: 'class_001' });
      setTimeout(() => setMessage(''), 3000);
    } else {
      setError(result.message);
      setTimeout(() => setError(''), 3000);
    }
  };

  const openEditModal = (username: string, userData: typeof allUsers[0]['user']) => {
    setEditForm({
      username,
      name: userData.name,
      classId: userData.classId || 'class_001',
      avatar: userData.avatar || '👩‍🏫',
    });
    setShowEditModal(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const success = await adminUpdateUser(editForm.username, {
      user: {
        name: editForm.name,
        classId: editForm.classId,
        avatar: editForm.avatar,
      },
    });

    if (success) {
      setMessage('老师信息修改成功');
      setShowEditModal(false);
      setTimeout(() => setMessage(''), 3000);
    } else {
      setError('修改失败');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="admin-page animate-fade-in-up">
      <header className="page-header">
        <h1 className="brand-font gradient-text">教师管理</h1>
        <p>管理员可以新增、修改、删除所有老师信息</p>
      </header>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="admin-actions">
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          ➕ 新增老师
        </button>
      </div>

      <div className="users-table-card">
        <table className="users-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>班级</th>
              <th>头像</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map(({ username, user: u }) => (
              <tr key={username}>
                <td>{username}</td>
                <td>{u.name}</td>
                <td>{CLASS_NAME_MAP[u.classId || ''] || u.classId || '-'}</td>
                <td>{u.avatar || '👤'}</td>
                <td>
                  <div className="action-btns">
                    <button
                      className="btn-small btn-edit"
                      onClick={() => openEditModal(username, u)}
                    >
                      编辑
                    </button>
                    <button
                      className="btn-small btn-edit"
                      onClick={() => setEditingUser(editingUser === username ? null : username)}
                    >
                      {editingUser === username ? '取消' : '重置密码'}
                    </button>
                    <button
                      className="btn-small btn-delete"
                      onClick={() => handleDelete(username)}
                    >
                      删除
                    </button>
                  </div>
                  {editingUser === username && (
                    <div className="reset-password-form">
                      <input
                        type="password"
                        className="input-field"
                        placeholder="输入新密码"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        className="btn-small btn-confirm"
                        onClick={() => handleResetPassword(username)}
                      >
                        确认
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>编辑老师信息</h3>
            <form onSubmit={handleEditUser}>
              <div className="form-group">
                <label>用户名</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.username}
                  disabled
                  readOnly
                />
              </div>
              <div className="form-group">
                <label>姓名</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="请输入姓名"
                  required
                />
              </div>
              <div className="form-group">
                <label>所属班级</label>
                <select
                  className="input-field"
                  value={editForm.classId}
                  onChange={(e) => setEditForm({ ...editForm, classId: e.target.value })}
                >
                  {CLASSES.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>选择头像</label>
                <div className="avatar-grid">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      className={`avatar-option ${editForm.avatar === avatar ? 'active' : ''}`}
                      onClick={() => setEditForm({ ...editForm, avatar })}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>新增老师</h3>
            <form onSubmit={handleAddUser}>
              <div className="form-group">
                <label>用户名</label>
                <input
                  type="text"
                  className="input-field"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  placeholder="至少3个字符"
                  required
                />
              </div>
              <div className="form-group">
                <label>姓名</label>
                <input
                  type="text"
                  className="input-field"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="请输入姓名"
                  required
                />
              </div>
              <div className="form-group">
                <label>所属班级</label>
                <select
                  className="input-field"
                  value={addForm.classId}
                  onChange={(e) => setAddForm({ ...addForm, classId: e.target.value })}
                >
                  {CLASSES.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>密码</label>
                <input
                  type="password"
                  className="input-field"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="至少6个字符"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .admin-page {
          max-width: 1000px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .page-header h1 {
          font-size: 28px;
          margin-bottom: 8px;
        }

        .page-header p {
          color: var(--text-secondary);
          font-size: 15px;
        }

        .error-state {
          padding: 40px;
          text-align: center;
          background: white;
          border-radius: var(--radius-lg);
          color: #DC2626;
          font-size: 16px;
        }

        .alert {
          padding: 12px 16px;
          border-radius: var(--radius-md);
          margin-bottom: 16px;
          font-size: 14px;
        }

        .alert.success {
          background: #D1FAE5;
          color: #059669;
        }

        .alert.error {
          background: #FEE2E2;
          color: #DC2626;
        }

        .admin-actions {
          margin-bottom: 20px;
        }

        .users-table-card {
          background: white;
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-soft);
          overflow-x: auto;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }

        .users-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 2px solid var(--border);
        }

        .users-table td {
          padding: 14px 16px;
          font-size: 14px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border);
        }

        .users-table tr:last-child td {
          border-bottom: none;
        }

        .action-btns {
          display: flex;
          gap: 8px;
        }

        .btn-small {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }

        .btn-edit {
          background: #E0E7FF;
          color: #4338CA;
        }

        .btn-edit:hover {
          background: #C7D2FE;
        }

        .btn-delete {
          background: #FEE2E2;
          color: #DC2626;
        }

        .btn-delete:hover {
          background: #FECACA;
        }

        .btn-confirm {
          background: #D1FAE5;
          color: #059669;
        }

        .btn-confirm:hover {
          background: #A7F3D0;
        }

        .reset-password-form {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .reset-password-form input {
          flex: 1;
          min-width: 120px;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: var(--radius-lg);
          padding: 32px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .modal-content h3 {
          font-size: 18px;
          margin-bottom: 20px;
          color: var(--text-primary);
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .avatar-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-top: 8px;
        }

        .avatar-option {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          border: 2px solid transparent;
          background: var(--bg-warm);
          font-size: 24px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-option:hover {
          border-color: var(--primary-light);
          transform: scale(1.1);
        }

        .avatar-option.active {
          border-color: var(--primary);
          background: linear-gradient(135deg, rgba(255, 140, 66, 0.1) 0%, rgba(107, 91, 149, 0.1) 100%);
        }

        .btn-secondary {
          padding: 10px 20px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: white;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background: var(--bg-warm);
        }
      `}</style>
    </div>
  );
};

export default AdminUsersPage;
