import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface StatsData {
  totalChildren: number;
  todayCount: number;
  classCount: number;
  avgLevel: number;
}

export function useStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getStats();
      setStats(response.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取统计数据失败';
      setError(message);
      console.warn('API获取统计数据失败，使用默认值:', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
