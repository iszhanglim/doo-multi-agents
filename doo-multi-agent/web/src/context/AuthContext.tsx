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
  login: (username: string, password: string) => Promise<boolean>;
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

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
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

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetchApi<{ success: boolean; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setUser(res.user);
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(res.user));
      localStorage.setItem(USERNAME_KEY, username);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_SESSION_KEY);
    localStorage.removeItem(USERNAME_KEY);
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
      const res = await fetchApi<{ success: boolean; users: Array<{ username: string; name: string; role: string; class_id: string | null; avatar: string }> }>('/auth/users');
      return res.users.map(u => ({
        username: u.username,
        user: { id: u.username, name: u.name, role: u.role as 'teacher' | 'admin', classId: u.class_id || undefined, avatar: u.avatar },
      }));
    } catch {
      return [];
    }
  }, []);

  const adminUpdateUser = useCallback(async (_username: string, _updates: { user?: Partial<User> }): Promise<boolean> => {
    return true;
  }, []);

  const adminDeleteUser = useCallback(async (username: string): Promise<boolean> => {
    try {
      await fetchApi<{ success: boolean }>(`/auth/user/${username}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }, []);

  const adminResetPassword = useCallback(async (_username: string, _newPassword: string): Promise<boolean> => {
    return false;
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
