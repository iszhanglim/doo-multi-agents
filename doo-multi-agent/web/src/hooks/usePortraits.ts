import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { ChildPortrait } from '../types';

export function usePortraits() {
  const [portraits, setPortraits] = useState<ChildPortrait[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortraits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getPortraits();
      setPortraits(response.portraits);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取画像失败';
      setError(message);
      console.warn('API获取画像失败:', message);
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePortrait = useCallback(async (childId: string) => {
    try {
      await api.deletePortrait(childId);
      setPortraits((prev) => prev.filter((p) => p.childId !== childId));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除画像失败';
      setError(message);
      console.warn('API删除画像失败:', message);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchPortraits();
  }, [fetchPortraits]);

  return { portraits, loading, error, refetch: fetchPortraits, deletePortrait };
}
