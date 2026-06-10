/**
 * 面试历史记录 Store
 *
 * 用 Pinia + pinia-plugin-persistedstate 存到 localStorage,
 * 刷新页面不丢。
 */

import { defineStore } from 'pinia';
import type { InterviewDimension, InterviewEvaluation } from '@/types/interviewJobs';

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

export const useInterviewHistoryStore = defineStore('interviewHistory', {
  state: () => ({
    records: [] as InterviewRecord[],
  }),
  getters: {
    latest: (state) => state.records[0] ?? null,
    byId: (state) => (id: string) => state.records.find((r) => r.id === id) ?? null,
  },
  actions: {
    add(record: Omit<InterviewRecord, 'id' | 'timestamp'>) {
      const newRecord: InterviewRecord = {
        ...record,
        id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      this.records.unshift(newRecord);  // 最新的放最前面
      // 限制最多 20 条,避免 localStorage 爆
      if (this.records.length > 20) {
        this.records = this.records.slice(0, 20);
      }
      return newRecord;
    },
    remove(id: string) {
      this.records = this.records.filter((r) => r.id !== id);
    },
    clear() {
      this.records = [];
    },
  },
  persist: true,
});
