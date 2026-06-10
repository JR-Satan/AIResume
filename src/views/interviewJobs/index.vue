<template>
  <main class="interview-page">
    <section class="page-header">
      <div class="page-header-text">
        <p class="eyebrow">3-5 模拟面试与岗位推荐</p>
        <h1>岗位推荐与文本面试</h1>
        <p class="subtitle">
          基于当前简历提取候选人特征，生成更匹配的岗位推荐，并给出文本面试题与面试评估。
        </p>
      </div>
      <a-space wrap>
        <a-button :loading="recommendationLoading" :disabled="questionLoading" @click="refreshAll">
          刷新推荐
        </a-button>
        <a-button
          type="primary"
          :loading="questionLoading"
          :disabled="questionLoading || recommendationLoading"
          @click="regenerateQuestions"
        >
          生成面试题
        </a-button>
      </a-space>
    </section>

    <transition name="thinking">
      <div v-if="llmThinkingText" class="llm-thinking" role="status" aria-live="polite">
        <span class="thinking-dots" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span class="thinking-text">{{ llmThinkingText }}</span>
      </div>
    </transition>

    <a-row :gutter="20">
      <a-col :xs="24" :lg="9">
        <a-card title="简历特征" class="panel">
          <div class="metric-grid">
            <div class="metric">
              <span>目标岗位</span>
              <strong>{{ features.targetPosition || '未填写' }}</strong>
            </div>
            <div class="metric">
              <span>学历层次</span>
              <strong>{{ features.educationLevel }}</strong>
            </div>
            <div class="metric">
              <span>经验年限</span>
              <strong>{{ features.experienceYears }} 年</strong>
            </div>
          </div>

          <a-divider />

          <h3>技能关键词</h3>
          <div class="tag-stack">
            <a-tag v-for="skill in features.skills" :key="skill" color="blue" class="multi-line-tag">
              {{ skill }}
            </a-tag>
            <a-empty v-if="features.skills.length === 0" description="暂无技能关键词" />
          </div>

          <h3>项目/经历关键词</h3>
          <div class="tag-cluster">
            <a-tag v-for="keyword in mergedKeywords" :key="keyword" class="keyword-tag">
              {{ keyword }}
            </a-tag>
          </div>
        </a-card>

        <a-card title="岗位推荐" class="panel">
          <a-list :data-source="recommendations" item-layout="vertical">
            <template #renderItem="{ item }">
              <a-list-item
                class="job-item"
                :class="{ active: item.job.id === selectedJobId }"
                @click="selectJob(item.job.id)"
              >
                <div class="job-line">
                  <strong>{{ item.job.title }}</strong>
                  <a-progress type="circle" :percent="item.score" :size="48" />
                </div>
                <p class="job-reason">{{ item.reason }}</p>
                <div class="tag-cluster">
                  <a-tag
                    v-for="keyword in item.matchedKeywords"
                    :key="keyword"
                    color="green"
                    class="keyword-tag"
                  >
                    {{ keyword }}
                  </a-tag>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="15">
        <a-card :title="selectedRecommendation?.job.title || '模拟面试'" class="panel">
          <template #extra>
            <a-tag color="purple" class="keyword-tag">{{ selectedRecommendation?.job.industry }}</a-tag>
          </template>

          <a-alert
            v-if="!llmReady"
            type="info"
            show-icon
            message="当前未配置通用 LLM API Key，系统将使用本地题库与规则评分。"
          />

          <div v-if="selectedRecommendation" class="job-detail">
            <h3>岗位要求</h3>
            <ul>
              <li v-for="requirement in selectedRecommendation.job.requirements" :key="requirement">
                {{ requirement }}
              </li>
            </ul>
          </div>

          <a-spin :spinning="questionLoading || evaluationLoading">
            <div class="question-list">
              <section v-for="question in questions" :key="question.id" class="question-card">
                <div class="question-title">
                  <span>Q{{ question.id }}</span>
                  <strong>{{ question.question }}</strong>
                  <a-tag class="keyword-tag">{{ question.dimension }}</a-tag>
                </div>
                <p class="reference">参考要点：{{ question.referencePoints.join(' / ') }}</p>
                <a-textarea
                  v-model:value="answers[question.id]"
                  :rows="4"
                  placeholder="请输入你的面试回答"
                />
              </section>
            </div>
          </a-spin>

          <a-button type="primary" block :loading="evaluationLoading" @click="submitEvaluation">
            提交并生成评估
          </a-button>
        </a-card>

        <a-card v-if="evaluation" title="面试评分" class="panel">
          <div class="evaluation-layout">
            <div class="radar-wrap">
              <svg viewBox="-36 0 332 260" role="img" aria-label="面试评分雷达图">
                <polygon class="radar-grid" points="130,20 234.6,96 194.7,219 65.3,219 25.4,96" />
                <polygon class="radar-grid weak" points="130,57 199.7,107.7 173.1,189.7 86.9,189.7 60.3,107.7" />
                <polygon class="radar-area" :points="radarPoints" />
                <g v-for="label in radarLabels" :key="label.text">
                  <text :x="label.x" :y="label.y" text-anchor="middle">{{ label.text }}</text>
                </g>
              </svg>
            </div>
            <div class="evaluation-text">
              <a-statistic title="综合评分" :value="evaluation.totalScore" suffix="/ 5" />
              <p>{{ evaluation.summary }}</p>
              <h3>优势</h3>
              <ul>
                <li v-for="item in evaluation.strengths" :key="item">{{ item }}</li>
              </ul>
              <h3>改进建议</h3>
              <ul>
                <li v-for="item in evaluation.improvements" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>

          <section v-if="evaluation.questionAnalyses?.length" class="question-analysis-section">
            <h3>逐题回答分析</h3>
            <div class="question-analysis-list">
              <article
                v-for="item in evaluation.questionAnalyses"
                :key="item.questionId"
                class="question-analysis-item"
              >
                <div class="question-analysis-title">
                  <strong>Q{{ item.questionId }} {{ getQuestionText(item.questionId) }}</strong>
                  <a-tag color="blue" class="keyword-tag">{{ item.score }} / 5</a-tag>
                </div>
                <p>{{ item.analysis }}</p>
                <div class="question-analysis-columns">
                  <div>
                    <span class="analysis-label strength-label">回答亮点</span>
                    <ul>
                      <li v-for="strength in item.strengths" :key="strength">{{ strength }}</li>
                    </ul>
                  </div>
                  <div>
                    <span class="analysis-label improvement-label">改进方向</span>
                    <ul>
                      <li v-for="improvement in item.improvements" :key="improvement">{{ improvement }}</li>
                    </ul>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </a-card>
      </a-col>
    </a-row>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useResumeStore, useSettingsStore } from '@/store';
import type {
  InterviewEvaluation,
  InterviewQuestion,
  JobRecommendation,
  ResumeFeatures,
} from '@/types/interviewJobs';
import {
  INTERVIEW_DIMENSIONS,
  evaluateInterviewSession,
  extractResumeFeatures,
  extractResumeFeaturesWithLlm,
  generateInterviewQuestions,
  recommendJobs,
  recommendJobsWithLlm,
} from '@/services/interviewJobs';

const resumeStore = useResumeStore();
const settingsStore = useSettingsStore();
const snapshot = computed(() => resumeStore.getResumeSnapshot());
const features = ref<ResumeFeatures>(extractResumeFeatures(snapshot.value));
const recommendations = ref<JobRecommendation[]>([]);
const selectedJobId = ref('');
const questions = ref<InterviewQuestion[]>([]);
const answers = reactive<Record<number, string>>({});
const evaluation = ref<InterviewEvaluation | null>(null);
const recommendationLoading = ref(false);
const questionLoading = ref(false);
const evaluationLoading = ref(false);
const llmThinkingText = ref('');
const llmReady = computed(() => Boolean(settingsStore.aliApiKey.trim() && settingsStore.aliApiUrl.trim()));

const selectedRecommendation = computed(() => {
  return recommendations.value.find((item) => item.job.id === selectedJobId.value) || recommendations.value[0];
});

const mergedKeywords = computed(() => {
  return Array.from(new Set([...features.value.projectKeywords, ...features.value.workKeywords])).slice(0, 20);
});

const radarPoints = computed(() => {
  if (!evaluation.value) return '';
  return INTERVIEW_DIMENSIONS.map((dimension, index) => {
    const score = evaluation.value?.scores[dimension] || 0;
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / INTERVIEW_DIMENSIONS.length;
    const radius = (score / 5) * 110;
    return `${130 + Math.cos(angle) * radius},${130 + Math.sin(angle) * radius}`;
  }).join(' ');
});

const radarLabels = INTERVIEW_DIMENSIONS.map((dimension, index) => {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / INTERVIEW_DIMENSIONS.length;
  return {
    text: dimension,
    x: 130 + Math.cos(angle) * 124,
    y: 134 + Math.sin(angle) * 124
  };
});

onMounted(async () => {
  await refreshAll();
});

async function refreshAll() {
  recommendationLoading.value = true;
  try {
    let nextFeatures: ResumeFeatures;
    if (llmReady.value) {
      llmThinkingText.value = '大模型正在分析简历...';
      nextFeatures = await extractResumeFeaturesWithLlm(snapshot.value);
    } else {
      nextFeatures = extractResumeFeatures(snapshot.value);
    }

    features.value = nextFeatures;
    if (llmReady.value) {
      llmThinkingText.value = '大模型正在匹配岗位...';
      recommendations.value = await recommendJobsWithLlm(nextFeatures, undefined, 5);
    } else {
      recommendations.value = recommendJobs(nextFeatures, undefined, 5);
    }
    selectedJobId.value = recommendations.value[0]?.job.id || '';
    evaluation.value = null;
    await regenerateQuestions();
  } finally {
    recommendationLoading.value = false;
    llmThinkingText.value = '';
  }
}

function selectJob(jobId: string) {
  selectedJobId.value = jobId;
  evaluation.value = null;
  void regenerateQuestions();
}

async function regenerateQuestions() {
  const selected = selectedRecommendation.value;
  if (!selected) return;

  questionLoading.value = true;
  let waitTimer: number | undefined;
  let llmError = '';

  if (llmReady.value) {
    let elapsedSeconds = 0;
    llmThinkingText.value = '大模型正在生成面试题（已等待 0 秒）';
    waitTimer = window.setInterval(() => {
      elapsedSeconds += 1;
      llmThinkingText.value = `大模型正在生成面试题（已等待 ${elapsedSeconds} 秒）`;
    }, 1000);
  }

  try {
    evaluation.value = null;
    Object.keys(answers).forEach((key) => {
      delete answers[Number(key)];
    });

    questions.value = await generateInterviewQuestions(
      features.value,
      selected.job,
      5,
      (error) => {
        llmError = error;
      }
    );

    if (llmError) {
      message.warning(`${formatLlmError(llmError)}，已使用本地题库生成题目。`);
    }
  } finally {
    if (waitTimer !== undefined) {
      window.clearInterval(waitTimer);
    }
    questionLoading.value = false;
    llmThinkingText.value = '';
  }
}

async function submitEvaluation() {
  const selected = selectedRecommendation.value;
  if (!selected) return;

  const answeredQuestions = questions.value.filter((question) => (answers[question.id] || '').trim());
  if (!answeredQuestions.length) {
    message.warning('请至少回答一道题后再提交评分。');
    return;
  }

  evaluationLoading.value = true;
  if (llmReady.value) {
    llmThinkingText.value = '大模型正在评估面试表现...';
  }

  try {
    evaluation.value = await evaluateInterviewSession(
      answeredQuestions.map((question) => ({
        question,
        answer: answers[question.id]
      })),
      features.value,
      selected.job
    );
  } finally {
    evaluationLoading.value = false;
    llmThinkingText.value = '';
  }
}

function getQuestionText(questionId: number): string {
  return questions.value.find((question) => question.id === questionId)?.question || '';
}

function formatLlmError(error: string): string {
  if (error === 'REQUEST_TIMEOUT') return '大模型请求超过 5 分钟未返回';
  if (error.startsWith('HTTP_401')) return `API Key 认证失败${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_403')) return `当前 API Key 没有调用权限${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_404')) return `API 地址或模型名称不正确${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_400')) return `请求参数或模型名称不正确${getLlmErrorDetail(error)}`;
  if (error === 'HTTP_429_RATE_LIMIT' || error === 'HTTP_429_COOLDOWN') return '大模型接口请求过于频繁';
  if (error === 'E005' || error === 'INVALID_QUESTION_RESPONSE') return '大模型返回的题目格式无法解析';
  if (/failed to fetch|networkerror|load failed/i.test(error)) return '网络请求失败或接口不允许浏览器跨域访问';
  return `大模型调用失败（${error}）`;
}

function getLlmErrorDetail(error: string): string {
  const detail = error.split(':').slice(1).join(':').trim();
  return detail ? `（${detail}）` : '';
}
</script>

<style scoped>
.interview-page {
  max-width: 1360px;
  margin: 0 auto;
  padding: 28px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header-text {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 6px;
  color: #3653c9;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.subtitle {
  margin: 8px 0 0;
  color: #667085;
  line-height: 1.6;
}

.llm-thinking {
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 10px;
  margin: -6px 0 18px;
  padding: 8px 12px;
  color: #344054;
  background: #f0f5ff;
  border: 1px solid #adc6ff;
  border-radius: 6px;
  font-size: 14px;
}

.thinking-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  background: #3653c9;
  border-radius: 50%;
  animation: thinking-pulse 1.2s ease-in-out infinite;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.32s;
}

.thinking-enter-active,
.thinking-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.thinking-enter-from,
.thinking-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes thinking-pulse {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.panel {
  margin-bottom: 20px;
  border-radius: 8px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.metric {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.metric span {
  display: block;
  color: #667085;
  font-size: 12px;
}

.metric strong {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.tag-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-cluster {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.multi-line-tag,
.keyword-tag {
  margin-inline-end: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.6;
}

.multi-line-tag {
  display: block;
  width: 100%;
  padding: 6px 12px;
}

.keyword-tag {
  display: inline-flex;
  align-items: center;
}

.job-item {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.job-item.active {
  background: #f0f5ff;
  border-color: #3653c9;
}

.job-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.job-line strong {
  flex: 1;
  min-width: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.job-reason {
  overflow-wrap: anywhere;
}

.job-detail {
  margin-top: 16px;
}

.job-detail li {
  overflow-wrap: anywhere;
}

.question-list {
  display: grid;
  gap: 14px;
  margin: 18px 0;
}

.question-card {
  padding: 14px;
  background: #fbfcff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.question-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.question-title strong {
  flex: 1 1 320px;
  min-width: 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.question-title span {
  color: #3653c9;
  font-weight: 700;
}

.reference {
  color: #667085;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.evaluation-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 24px;
  align-items: center;
}

.radar-wrap svg {
  width: 100%;
  max-width: 332px;
}

.radar-grid {
  fill: none;
  stroke: #cbd5e1;
  stroke-width: 1;
}

.radar-grid.weak {
  stroke-dasharray: 4 4;
}

.radar-area {
  fill: rgba(54, 83, 201, 0.24);
  stroke: #3653c9;
  stroke-width: 2;
}

text {
  fill: #475467;
  font-size: 12px;
}

.evaluation-text p {
  margin-top: 12px;
  color: #475467;
  overflow-wrap: anywhere;
}

.evaluation-text li {
  overflow-wrap: anywhere;
}

.question-analysis-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.question-analysis-section > h3 {
  margin: 0 0 14px;
}

.question-analysis-list {
  display: grid;
  gap: 12px;
}

.question-analysis-item {
  padding: 14px 16px;
  background: #f8fafc;
  border-left: 3px solid #3653c9;
}

.question-analysis-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.question-analysis-title strong {
  line-height: 1.6;
  flex: 1 1 320px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.question-analysis-item > p {
  margin: 8px 0 12px;
  color: #475467;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.question-analysis-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.question-analysis-columns ul {
  margin: 6px 0 0;
  padding-left: 20px;
  color: #475467;
}

.question-analysis-columns li {
  overflow-wrap: anywhere;
}

.analysis-label {
  font-size: 13px;
  font-weight: 700;
}

.strength-label {
  color: #237804;
}

.improvement-label {
  color: #ad4e00;
}

@media (max-width: 900px) {
  .interview-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .metric-grid,
  .question-analysis-columns,
  .evaluation-layout {
    grid-template-columns: 1fr;
  }
}
</style>
