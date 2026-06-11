/**
 * 3-5 模拟面试及职位推送组
 * 本文件负责按登录用户保存、查询和管理语音面试历史记录。
 */

/**
 * 面试历史记录 Store
 *
 * 用 Pinia + pinia-plugin-persistedstate 存到 localStorage,
 * 刷新页面不丢。
 */

import { defineStore } from 'pinia';
import type { InterviewDimension, InterviewEvaluation } from '@/types/interviewJobs';
import { useUserStore } from './useUserStore';

export interface InterviewRecord {
  id: string;
  timestamp: number;
  jobTitle: string;
  candidateTargetPosition: string;
  evaluation: InterviewEvaluation;
  /** 每道题的详细评分（可选） */
  answers?: Array<{
    questionId: number;
    dimension: InterviewDimension;
    score: number;
    comment: string;
  }>;
}

const resolveHistoryUsername = (username?: string | null): string => {
  const normalizedUsername = username?.trim();
  if (normalizedUsername) return normalizedUsername;

  const userStore = useUserStore();
  return userStore.currentUser?.username?.trim() || 'guest';
};

export const useInterviewHistoryStore = defineStore('interviewHistory', {
  state: () => ({
    // records 保留为旧版本迁移入口；新数据统一写入 recordsByUser。
    records: [] as InterviewRecord[],
    recordsByUser: {} as Record<string, InterviewRecord[]>,
  }),
  getters: {
    latest: (state): InterviewRecord | null => {
      const owner = resolveHistoryUsername();
      return state.recordsByUser[owner]?.[0] ?? null;
    },
    byId: (state) => {
      return (id: string, username?: string | null) =>
        (state.recordsByUser[resolveHistoryUsername(username)] ?? [])
          .find((record: InterviewRecord) => record.id === id) ?? null;
    },
  },
  actions: {
    migrateLegacyRecords(username?: string | null) {
      if (this.records.length === 0) return;

      const owner = resolveHistoryUsername(username);
      const current = this.recordsByUser[owner] ?? [];
      const mergedMap = new Map<string, InterviewRecord>();
      [...this.records, ...current].forEach((record) => {
        mergedMap.set(record.id, record);
      });

      this.recordsByUser[owner] = Array.from(mergedMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
      this.records = [];
    },
    getRecords(username?: string | null): InterviewRecord[] {
      const owner = resolveHistoryUsername(username);
      return this.recordsByUser[owner] ?? [];
    },
    add(record: Omit<InterviewRecord, 'id' | 'timestamp'>, username?: string | null) {
      this.migrateLegacyRecords(username);
      const owner = resolveHistoryUsername(username);
      const newRecord: InterviewRecord = {
        ...record,
        id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      const records = [newRecord, ...(this.recordsByUser[owner] ?? [])].slice(0, 20);
      this.recordsByUser[owner] = records;
      return newRecord;
    },
    remove(id: string, username?: string | null) {
      this.migrateLegacyRecords(username);
      const owner = resolveHistoryUsername(username);
      this.recordsByUser[owner] = (this.recordsByUser[owner] ?? []).filter((record) => record.id !== id);
    },
    clear(username?: string | null) {
      this.migrateLegacyRecords(username);
      const owner = resolveHistoryUsername(username);
      this.recordsByUser[owner] = [];
    },
  },
  persist: true,
});
