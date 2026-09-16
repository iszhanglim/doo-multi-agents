import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Activity {
  child: string;
  action: string;
  time: string;
  level: number;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getPortraits();
      const portraits = response.portraits;

      // 从画像的评估记录生成活动列表
      const acts: Activity[] = [];
      for (const portrait of portraits) {
        const assessments = portrait.basePortrait?.assessments || [];
        // 取最新的评估记录
        const latestAssessment = assessments[assessments.length - 1];
        if (latestAssessment) {
          const dims = latestAssessment.dimensions;
          const diction = (dims.diction.vocabulary + dims.diction.sentenceStructure) / 2;
          const organization = (dims.organization.narrativeStructure + dims.organization.timeMarker + dims.organization.themeRelevance + dims.organization.eventExpansion + dims.organization.expressiveness) / 5;
          const opinion = dims.opinion.narrativeViewpoint;
          const average = (diction + organization + opinion) / 3;
          let level = 1;
          if (average >= 2.5) level = 3;
          else if (average >= 1.5) level = 2;
          acts.push({
            child: portrait.name || portrait.childId,
            action: '完成叙事评估',
            time: formatTimeAgo(latestAssessment.timestamp || new Date()),
            level,
          });
        }
      }

      // 按时间排序（简化：根据 time 字符串长度粗略排序）
      acts.sort((a, b) => {
        const getPriority = (time: string) => {
          if (time.includes('刚刚')) return 0;
          if (time.includes('分钟')) return parseInt(time);
          if (time.includes('小时')) return parseInt(time) * 60;
          if (time.includes('天')) return parseInt(time) * 60 * 24;
          return 99999;
        };
        return getPriority(a.time) - getPriority(b.time);
      });

      setActivities(acts.slice(0, 10)); // 只显示最近10条
    } catch (err) {
      console.warn('获取活动失败:', err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return { activities, loading, refetch: fetchActivities };
}
