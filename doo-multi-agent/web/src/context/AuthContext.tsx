import React, { createContext, useContext, useState, useCallback } from 'react';

interface User {
  id: string;
  name: string;
  role: 'teacher' | 'admin';
  avatar?: string;
  classId?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; mustChangePassword: boolean }>;
  logout: () => void;
  register: (username: string, password: string, name: string, classId?: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: Partial<Pick<User, 'name' | 'avatar'>>) => Promise<boolean>;
  updatePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  getAllUsers: () => Promise<Array<{ username: string; user: User }>>;
  adminUpdateUser: (username: string, updates: { user?: Partial<User> }) => Promise<boolean>;
  adminDeleteUser: (username: string) => Promise<boolean>;
  adminResetPassword: (username: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';
const USER_SESSION_KEY = 'doo_user';
const USERNAME_KEY = 'doo_username';
/** 登录令牌（服务端 HMAC 签名）：管理类接口靠它做角色校验 */
const TOKEN_KEY = 'doo_token';

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Auth-Token': token } : {}),
      ...((options?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  // 服务端可能返回非 JSON（网关 502 / HTML 错误页），先兜住再判断，
  // 否则抛出的会是难以定位的 "Unexpected token < in JSON"
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((data.error as string) || `HTTP ${response.status}`);
  }
  return data as T;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (
    username: string, password: string
  ): Promise<{ ok: boolean; mustChangePassword: boolean }> => {
    try {
      const res = await fetchApi<{ success: boolean; user: User; token?: string; mustChangePassword?: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setUser(res.user);
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(res.user));
      localStorage.setItem(USERNAME_KEY, username);
      if (res.token) {
        localStorage.setItem(TOKEN_KEY, res.token);
      }
      return { ok: true, mustChangePassword: res.mustChangePassword === true };
    } catch {
      return { ok: false, mustChangePassword: false };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_SESSION_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const register = useCallback(async (
    username: string, password: string, name: string, classId?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      await fetchApi<{ success: boolean; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, name, classId }),
      });
      return { success: true, message: '注册成功' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '注册失败' };
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Pick<User, 'name' | 'avatar'>>): Promise<boolean> => {
    // 注意：仅更新本地会话。后端没有「教师自改资料」接口，
    // 管理员改他人资料走 adminUpdateUser（PATCH /auth/user/:username）。
    if (!user) return false;
    const updated = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(updated));
    return true;
  }, [user]);

  const updatePassword = useCallback(async (
    oldPassword: string, newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    const username = localStorage.getItem(USERNAME_KEY);
    if (!username) return { success: false, message: '未登录' };
    try {
      await fetchApi<{ success: boolean }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ username, oldPassword, newPassword }),
      });
      return { success: true, message: '密码修改成功' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '修改失败' };
    }
  }, []);

  const getAllUsers = useCallback(async (): Promise<Array<{ username: string; user: User }>> => {
    try {
      const res = await fetchApi<{
        success: boolean;
        users: Array<{ username: string; name: string; role: string; class_id: string | null; avatar: string }>;
      }>('/auth/users');
      return res.users.map(u => ({
        username: u.username,
        user: {
          id: u.username,
          name: u.name,
          role: u.role as 'teacher' | 'admin',
          classId: u.class_id || undefined,
          avatar: u.avatar,
        },
      }));
    } catch {
      // 无权限（403）或未登录（401）时返回空列表，由页面自身提示无权限
      return [];
    }
  }, []);

  const adminUpdateUser = useCallback(async (
    username: string,
    updates: { user?: Partial<User> }
  ): Promise<boolean> => {
    try {
      // 后端 PATCH /auth/user/:username（仅管理员）—— 列名白名单在服务端校验
      await fetchApi<{ success: boolean }>(`/auth/user/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: updates.user?.name,
          classId: updates.user?.classId,
          avatar: updates.user?.avatar,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const adminDeleteUser = useCallback(async (username: string): Promise<boolean> => {
    try {
      await fetchApi<{ success: boolean }>(`/auth/user/${encodeURIComponent(username)}`, {
        method: 'DELETE',
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const adminResetPassword = useCallback(async (
    username: string, newPassword: string
  ): Promise<boolean> => {
    try {
      // 管理员重置他人密码：POST /auth/user/:username/password（无需旧密码）
      await fetchApi<{ success: boolean }>(
        `/auth/user/${encodeURIComponent(username)}/password`,
        { method: 'POST', body: JSON.stringify({ newPassword }) }
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout,
      register,
      updateProfile,
      updatePassword,
      getAllUsers,
      adminUpdateUser,
      adminDeleteUser,
      adminResetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
