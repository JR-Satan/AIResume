<!--
  3-5 模拟面试及职位推送组
  本组件负责展示语音面试过程、麦克风状态、对话转写和每题评分。
-->

<template>
  <div class="interview-room">
    <!-- 顶部信息条 -->
    <div class="room-header">
      <div class="left">
        <a-button size="small" @click="$emit('stop')">← 结束</a-button>
        <span class="timer">
          <span class="icon">⏱</span> {{ formatTime(elapsedSeconds) }}
        </span>
      </div>
      <div class="progress">
        <span class="progress-text">第 <strong>{{ currentQuestion?.questionId || 1 }}</strong> / 5 题</span>
        <div class="dots">
          <div
            v-for="i in 5"
            :key="i"
            class="dot"
            :class="{
              done: i < (currentQuestion?.questionId || 1),
              current: i === (currentQuestion?.questionId || 1),
            }"
          >
            <span v-if="i < (currentQuestion?.questionId || 1)">✓</span>
            <span v-else>{{ i }}</span>
          </div>
        </div>
      </div>
      <div class="right">
        <a-tag color="blue">基础语音版</a-tag>
        <a-button
          :type="micOn ? 'primary' : 'default'"
          size="small"
          @click="$emit('toggle-mic')"
        >
          {{ micOn ? '🎙️ 关闭麦克风' : '🎙️ 打开麦克风' }}
        </a-button>
      </div>
    </div>

    <!-- AI 头像 + 状态 -->
    <div class="avatar-area">
      <div class="ai-avatar" :class="aiStateClass">
        <div class="avatar-inner">AI</div>
        <div class="pulse-ring" />
        <div class="pulse-ring delay" />
      </div>
      <div class="avatar-label">
        <div class="ai-name">面试官</div>
        <div class="ai-state">
          {{ aiStateLabel }}
          <span v-if="state === 'thinking'" class="thinking-dots" aria-hidden="true">
            <span class="dot" /><span class="dot" /><span class="dot" />
          </span>
        </div>
      </div>
    </div>

    <!-- 用户侧：自己的头像 + 波形 -->
    <div class="user-area">
      <div class="user-avatar">
        <div class="avatar-inner user">我</div>
      </div>
      <div class="user-mic-area">
        <div v-if="micOn" class="wave-bars">
          <div
            v-for="i in 16"
            :key="i"
            class="wave-bar"
            :style="{
              height: (8 + Math.random() * 24 * volume) + 'px',
              opacity: micOn ? (0.3 + volume * 0.7) : 0.1,
            }"
          />
        </div>
        <div v-else class="mic-muted">麦克风已关闭</div>
      </div>
    </div>

    <!-- 当前题信息 -->
    <div class="current-question">
      <a-tag color="purple" v-if="currentQuestion">
        正在问: {{ currentQuestion.dimension }}
      </a-tag>
      <span v-else class="muted">等待 AI 提问...</span>
    </div>

    <!-- 对话区 -->
    <h3>对话记录</h3>
    <div class="transcript-box" ref="transcriptRef">
      <div v-if="transcripts.length === 0" class="empty">等待对话开始...</div>
      <div
        v-for="(item, idx) in transcripts"
        :key="idx"
        class="transcript-item"
        :class="`role-${item.role}`"
      >
        <strong>{{ item.role === 'user' ? '👤 我' : '🤖 面试官' }}:</strong>
        <span>{{ item.text }}</span>
      </div>
    </div>

    <!-- 已评分题列表 -->
    <div v-if="answers.length" class="score-tracker">
      <h3>已答题目评分</h3>
      <div v-for="ans in answers" :key="ans.questionId" class="score-item">
        <span class="dim">Q{{ ans.questionId }} · {{ ans.dimension }}</span>
        <a-rate :value="ans.score" disabled :count="5" allow-half style="font-size: 14px;" />
        <span class="comment">{{ ans.comment }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AnswerRecord, InterviewDimension, InterviewState, TranscriptSegment } from '@/services/interviewJobs/realtime';

const props = defineProps<{
  state: InterviewState;
  micOn: boolean;
  volume: number;
  elapsedSeconds: number;
  currentQuestion: { questionId: number; dimension: InterviewDimension } | null;
  answers: AnswerRecord[];
  transcripts: TranscriptSegment[];
}>();

defineEmits<{
  (e: 'stop'): void;
  (e: 'toggle-mic'): void;
}>();

const transcriptRef = ref<HTMLDivElement | null>(null);

// 自动滚到底
watch(() => props.transcripts.length, async () => {
  await nextTick();
  if (transcriptRef.value) transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight;
});

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

const aiStateClass = computed(() => {
  switch (props.state) {
    case 'greeting': return 'speaking';
    case 'in_question': return 'speaking';
    case 'thinking': return 'thinking';
    case 'evaluating': return 'thinking';
    default: return 'idle';
  }
});

const aiStateLabel = computed(() => {
  switch (props.state) {
    case 'connecting': return '正在连接...';
    case 'greeting': return '正在打招呼';
    case 'in_question': return '正在提问 / 倾听';
    case 'thinking': return '正在思考中';
    case 'evaluating': return '正在评分';
    default: return '空闲';
  }
});
</script>

<style scoped>
.interview-room { padding: 8px 4px; }

/* 顶部信息条 */
.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 20px;
}
.room-header .left, .room-header .right { display: flex; align-items: center; gap: 12px; }
.timer { font-size: 16px; font-weight: 600; color: #3653c9; font-family: 'Cascadia Code', monospace; }
.timer .icon { margin-right: 4px; }

.progress { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.progress-text { font-size: 12px; color: #64748b; }
.progress-text strong { color: #3653c9; font-size: 14px; }
.dots { display: flex; gap: 8px; }
.dot {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #94a3b8;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600;
  transition: all 0.3s ease;
}
.dot.done { background: #10b981; color: white; }
.dot.current {
  background: #3653c9; color: white;
  box-shadow: 0 0 0 4px rgba(54, 83, 201, 0.2);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(54, 83, 201, 0.2); }
  50% { box-shadow: 0 0 0 8px rgba(54, 83, 201, 0.1); }
}

/* AI 头像 */
.avatar-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 16px;
  background: linear-gradient(180deg, #f0f4ff 0%, #fafbff 100%);
  border-radius: 8px;
  margin-bottom: 16px;
}
.ai-avatar {
  position: relative;
  width: 88px; height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
}
.ai-avatar.idle { opacity: 0.6; }
.avatar-inner {
  color: white; font-size: 32px; font-weight: 700;
  z-index: 2;
  position: relative;
}
.pulse-ring {
  position: absolute;
  top: -4px; left: -4px; right: -4px; bottom: -4px;
  border-radius: 50%;
  border: 2px solid #667eea;
  opacity: 0;
}
.ai-avatar.speaking .pulse-ring {
  animation: ring-pulse 2s ease-out infinite;
}
.ai-avatar.speaking .pulse-ring.delay {
  animation-delay: 1s;
}
/* 思考状态：头像换成更柔和的渐变 + 慢速呼吸光晕，区别于 speaking 的扩散波纹 */
.ai-avatar.thinking {
  background: linear-gradient(135deg, #a78bfa 0%, #6366f1 100%);
  animation: thinking-glow 1.6s ease-in-out infinite;
}
.ai-avatar.thinking .pulse-ring,
.ai-avatar.thinking .pulse-ring.delay {
  animation: none;
  opacity: 0;
}
@keyframes thinking-glow {
  0%, 100% { box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3); }
  50%      { box-shadow: 0 4px 28px rgba(99, 102, 241, 0.65); }
}
@keyframes ring-pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.4); opacity: 0; }
}

.avatar-label { margin-top: 12px; text-align: center; }
.ai-name { font-size: 14px; font-weight: 600; color: #1e293b; }
.ai-state { font-size: 12px; color: #64748b; margin-top: 2px; }

/* 思考状态：在文字后面跟三个跳动的点，告诉用户「真的在算，没卡死」 */
.thinking-dots {
  display: inline-flex;
  gap: 3px;
  margin-left: 4px;
  vertical-align: middle;
}
.thinking-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #6366f1;
  animation: thinking-bounce 1.2s ease-in-out infinite;
}
.thinking-dots .dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes thinking-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-4px); opacity: 1; }
}

/* 用户头像 + 波形 */
.user-area {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 16px;
}
.user-avatar {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #34d399);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.avatar-inner.user { color: white; font-size: 18px; font-weight: 700; }
.user-mic-area { flex: 1; min-width: 0; }
.wave-bars {
  display: flex; align-items: center; gap: 3px;
  height: 40px;
}
.wave-bar {
  width: 4px;
  background: linear-gradient(180deg, #10b981, #34d399);
  border-radius: 2px;
  transition: height 0.05s ease;
}
.mic-muted { color: #94a3b8; font-size: 13px; text-align: center; padding: 12px 0; }

/* 当前题 */
.current-question {
  text-align: center;
  margin-bottom: 12px;
}
.current-question .muted { color: #94a3b8; font-size: 13px; }

/* 对话区 */
h3 { font-size: 14px; font-weight: 600; color: #1e293b; margin: 16px 0 8px; }
.transcript-box {
  height: 320px;
  overflow-y: auto;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
}
.transcript-item { margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; }
.transcript-item.role-user { background: #eff6ff; border-left: 3px solid #3b82f6; }
.transcript-item.role-assistant { background: #f0fdf4; border-left: 3px solid #22c55e; }
.transcript-item strong { display: block; margin-bottom: 4px; font-size: 12px; color: #475569; }
.empty { color: #94a3b8; text-align: center; padding: 60px 0; }

/* 评分追踪 */
.score-tracker { background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 12px; margin-top: 16px; }
.score-tracker h3 { color: #854d0e; margin-top: 0; }
.score-item { display: flex; align-items: center; gap: 12px; font-size: 12px; margin-bottom: 6px; }
.score-item .dim { min-width: 140px; color: #475569; font-weight: 600; }
.score-item .comment { color: #78716c; flex: 1; }
</style>
