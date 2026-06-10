<template>
  <a-modal
    :open="open"
    title="🎉 面试完成"
    width="860px"
    :footer="null"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div v-if="result" class="result-modal">
      <!-- 头部：综合分 + 元信息 -->
      <div class="result-header">
        <div class="overall-score">
          <div class="score-circle" :class="scoreLevel(result.overallScore)">
            <div class="score-num">{{ result.overallScore.toFixed(1) }}</div>
            <div class="score-suffix">/ 5.0</div>
          </div>
          <div class="score-text">
            <div class="level">{{ scoreLevelText(result.overallScore) }}</div>
            <div class="job">岗位: <strong>{{ result.jobTitle }}</strong></div>
            <div class="time">时间: {{ formatTime(result.timestamp) }}</div>
          </div>
        </div>
      </div>

      <a-divider />

      <!-- 5 维雷达图 -->
      <h3>各维度评分</h3>
      <div class="radar-wrap">
        <svg viewBox="0 0 360 360" style="width: 100%; max-width: 360px;">
          <polygon class="radar-grid" :points="radarGridOuter" />
          <polygon class="radar-grid weak" :points="radarGridInner" />
          <polygon class="radar-area" :points="radarPoints" />
          <g v-for="label in radarLabels" :key="label.text">
            <text :x="label.x" :y="label.y" text-anchor="middle" class="dim-text">{{ label.text }}</text>
            <text :x="label.x" :y="label.y + 18" text-anchor="middle" class="score-text">
              {{ result.dimensionScores[label.dim] || 0 }}
            </text>
          </g>
        </svg>
      </div>

      <a-divider />

      <!-- AI 总结 -->
      <h3>📋 AI 总结</h3>
      <p class="summary">{{ result.summary }}</p>

      <a-row :gutter="20">
        <a-col :span="12">
          <h3 class="strengths-title">✓ 优势</h3>
          <ul class="feedback-list strengths">
            <li v-for="(s, i) in result.strengths" :key="i">{{ s }}</li>
          </ul>
        </a-col>
        <a-col :span="12">
          <h3 class="improvements-title">⚠ 待改进</h3>
          <ul class="feedback-list improvements">
            <li v-for="(s, i) in result.improvements" :key="i">{{ s }}</li>
          </ul>
        </a-col>
      </a-row>

      <a-divider />

      <!-- 每道题明细 -->
      <h3>📝 每题详情</h3>
      <div class="questions-list">
        <div
          v-for="ans in result.answers"
          :key="ans.questionId"
          class="question-detail"
        >
          <div class="question-header">
            <a-tag color="blue">Q{{ ans.questionId }}</a-tag>
            <strong>{{ ans.dimension }}</strong>
            <a-rate :value="ans.score" disabled :count="5" allow-half style="font-size: 14px; margin-left: auto;" />
          </div>
          <div class="comment">{{ ans.comment }}</div>
        </div>
      </div>

      <a-divider />

      <!-- 操作按钮 -->
      <div class="result-actions">
        <a-button @click="emit('close')">关闭</a-button>
        <a-button type="primary" @click="handleDownload">下载报告</a-button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import type { InterviewDimension, InterviewResult } from '@/services/interviewJobs/realtime';

const props = defineProps<{ open: boolean; result: InterviewResult | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const dimensions: InterviewDimension[] = ['岗位动机', '项目表达', '专业能力', '逻辑结构', '沟通清晰'];

const radarGridOuter = '180,30 311.6,90 277,259 83,259 48.4,90';
const radarGridInner = '180,77 263,127 235,219 125,219 97,127';

const radarLabels = computed(() => {
  return dimensions.map((dim, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / dimensions.length;
    return {
      text: dim,
      dim,
      x: 180 + Math.cos(angle) * 140,
      y: 180 + Math.sin(angle) * 140 + 4,
    };
  });
});

const radarPoints = computed(() => {
  if (!props.result) return '';
  return dimensions.map((dim, i) => {
    const score = props.result!.dimensionScores[dim] || 0;
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / dimensions.length;
    const r = (score / 5) * 110;
    return `${180 + Math.cos(angle) * r},${180 + Math.sin(angle) * r}`;
  }).join(' ');
});

function scoreLevel(s: number): string {
  if (s >= 4) return 'excellent';
  if (s >= 3) return 'good';
  if (s >= 2) return 'average';
  return 'poor';
}

function scoreLevelText(s: number): string {
  if (s >= 4) return '表现优秀';
  if (s >= 3) return '表现良好';
  if (s >= 2) return '一般水平';
  return '需要提升';
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function handleDownload() {
  if (!props.result) return;
  const r = props.result;
  const text = `# AI 面试报告

**岗位**: ${r.jobTitle}
**时间**: ${formatTime(r.timestamp)}
**综合评分**: ${r.overallScore.toFixed(1)} / 5.0 (${scoreLevelText(r.overallScore)})

## 5 维评分
${dimensions.map((d) => `- ${d}: ${r.dimensionScores[d]}`).join('\n')}

## AI 总结
${r.summary}

## ✓ 优势
${r.strengths.map((s) => `- ${s}`).join('\n')}

## ⚠ 待改进
${r.improvements.map((s) => `- ${s}`).join('\n')}

## 每题详情
${r.answers.map((a) => `### Q${a.questionId} · ${a.dimension} (${a.score}/5)
${a.comment}`).join('\n\n')}
`;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `面试报告-${r.jobTitle}-${formatTime(r.timestamp).replace(/[/: ]/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  message.success('报告已下载');
}
</script>

<style scoped>
.result-modal { padding: 8px 0; }

.result-header {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
.overall-score {
  display: flex;
  align-items: center;
  gap: 20px;
}
.score-circle {
  width: 100px; height: 100px;
  border-radius: 50%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: white;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.score-circle.excellent { background: linear-gradient(135deg, #10b981, #34d399); }
.score-circle.good { background: linear-gradient(135deg, #3b82f6, #60a5fa); }
.score-circle.average { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
.score-circle.poor { background: linear-gradient(135deg, #ef4444, #f87171); }
.score-num { font-size: 36px; font-weight: 700; line-height: 1; }
.score-suffix { font-size: 12px; opacity: 0.8; }
.score-text .level { font-size: 18px; font-weight: 600; color: #1e293b; }
.score-text .job, .score-text .time { font-size: 12px; color: #64748b; margin-top: 4px; }

h3 { font-size: 14px; font-weight: 600; color: #1e293b; margin: 12px 0 8px; }

.radar-wrap { display: flex; justify-content: center; }
.radar-grid { fill: none; stroke: #cbd5e1; stroke-width: 1; }
.radar-grid.weak { stroke-dasharray: 4 4; }
.radar-area { fill: rgba(54, 83, 201, 0.24); stroke: #3653c9; stroke-width: 2; }
text { fill: #475467; font-size: 11px; }
.dim-text { fill: #475569 !important; font-size: 12px !important; }
.score-text { fill: #3653c9 !important; font-weight: 600; font-size: 14px !important; }

.summary {
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 6px;
  color: #334155;
  line-height: 1.7;
  margin: 0;
  border-left: 3px solid #3653c9;
}

.feedback-list { padding-left: 20px; margin: 0; line-height: 1.8; }
.feedback-list li { color: #475569; font-size: 13px; }
.strengths li::marker { color: #10b981; }
.improvements li::marker { color: #f59e0b; }
.strengths-title { color: #10b981; }
.improvements-title { color: #f59e0b; }

.questions-list { display: flex; flex-direction: column; gap: 10px; }
.question-detail {
  background: #f8fafc;
  border-left: 3px solid #3653c9;
  padding: 10px 14px;
  border-radius: 4px;
}
.question-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.question-header strong { color: #1e293b; font-size: 13px; }
.question-detail .comment { color: #64748b; font-size: 12px; line-height: 1.6; }

.result-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
