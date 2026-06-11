<!--
  3-5 模拟面试及职位推送组
  本组件负责展示、查看、删除和清空当前用户的语音面试历史记录。
-->

<template>
  <a-drawer
    :open="open"
    title="📋 面试历史"
    placement="right"
    width="480px"
    @close="emit('close')"
  >
    <div v-if="records.length === 0" class="empty">
      <div class="empty-icon">📭</div>
      <p>还没有面试记录</p>
      <p class="empty-tip">完成一次面试后,报告会保存在这里</p>
    </div>

    <div v-else class="record-list">
      <a-card
        v-for="rec in records"
        :key="rec.id"
        size="small"
        class="record-card"
        :class="getLevelClass(rec.evaluation.totalScore)"
      >
        <div class="record-header">
          <div>
            <div class="job-title">{{ rec.jobTitle }}</div>
            <div class="time">{{ formatTime(rec.timestamp) }}</div>
          </div>
          <div class="score-badge">
            <div class="score-num">{{ rec.evaluation.totalScore.toFixed(1) }}</div>
            <div class="score-suffix">/ 5</div>
          </div>
        </div>
        <div class="dimension-bars">
          <div
            v-for="(score, dim) in rec.evaluation.scores"
            :key="dim"
            class="dim-bar"
          >
            <span class="dim-name">{{ dim }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: ((score / 5) * 100) + '%' }" />
            </div>
            <span class="dim-score">{{ score }}</span>
          </div>
        </div>
        <div class="record-actions">
          <a-button size="small" type="link" @click="emit('view', rec)">查看完整报告</a-button>
          <a-popconfirm
            title="确定删除这条记录?"
            ok-text="确定"
            cancel-text="取消"
            @confirm="emit('delete', rec.id)"
          >
            <a-button size="small" type="link" danger>删除</a-button>
          </a-popconfirm>
        </div>
      </a-card>
    </div>

    <div v-if="records.length" class="clear-all">
      <a-popconfirm
        title="确定清空所有历史记录?"
        ok-text="清空"
        cancel-text="取消"
        @confirm="emit('clear-all')"
      >
        <a-button size="small" danger>清空所有</a-button>
      </a-popconfirm>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import type { InterviewRecord } from '@/store/useInterviewHistoryStore';

defineProps<{
  open: boolean;
  records: InterviewRecord[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'view', record: InterviewRecord): void;
  (e: 'delete', id: string): void;
  (e: 'clear-all'): void;
}>();

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getLevelClass(s: number) {
  if (s >= 4) return 'excellent';
  if (s >= 3) return 'good';
  return 'average';
}
</script>

<style scoped>
.empty {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty p { margin: 4px 0; font-size: 14px; }
.empty-tip { font-size: 12px !important; color: #cbd5e1; }

.record-list { display: flex; flex-direction: column; gap: 12px; }
.record-card { border-left: 4px solid #cbd5e1; transition: all 0.2s; cursor: default; }
.record-card.excellent { border-left-color: #10b981; }
.record-card.good { border-left-color: #3b82f6; }
.record-card.average { border-left-color: #f59e0b; }

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.job-title { font-size: 14px; font-weight: 600; color: #1e293b; }
.time { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.score-badge {
  background: linear-gradient(135deg, #3653c9, #667eea);
  color: white;
  border-radius: 6px;
  padding: 6px 12px;
  text-align: center;
}
.score-badge .score-num { font-size: 18px; font-weight: 700; line-height: 1; }
.score-badge .score-suffix { font-size: 9px; opacity: 0.8; }

.dimension-bars { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.dim-bar { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.dim-name { min-width: 64px; color: #64748b; }
.bar-track { flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #3653c9); border-radius: 3px; }
.dim-score { min-width: 18px; text-align: right; color: #475569; font-weight: 600; }

.record-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  border-top: 1px solid #f1f5f9;
  padding-top: 6px;
  margin-top: 6px;
}

.clear-all { text-align: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
</style>
