<!--
  3-5 模拟面试及职位推送组
  本页面负责串联简历特征提取、岗位推荐、文本面试、综合评分和雷达图展示。
-->

<template>
  <main class="interview-page">
    <section class="page-header">
      <div class="page-header-text">
        <p class="eyebrow">3-5 模拟面试与岗位推荐</p>
        <h1>岗位推荐与文本面试</h1>
        <p class="subtitle">
          页面默认使用本地规则即时生成结果，需要大模型增强时，可在对应模块中单独触发。
        </p>
      </div>
      <a-button :disabled="isBusy" @click="refreshLocalResults">刷新本地结果</a-button>
    </section>

    <Teleport to="body">
      <transition name="thinking">
        <div v-if="llmThinkingText" class="ai-thinking-backdrop">
          <section class="ai-thinking-stage" role="status" aria-live="polite">
            <div class="thinking-visual" aria-hidden="true">
              <span class="orbit orbit-outer"></span>
              <span class="orbit orbit-middle"></span>
              <span class="orbit orbit-inner"></span>
              <span class="signal-node node-one"></span>
              <span class="signal-node node-two"></span>
              <span class="signal-node node-three"></span>
              <span class="thinking-core">AI</span>
            </div>
            <div class="thinking-copy">
              <p class="thinking-kicker">MODEL REASONING</p>
              <h2>{{ llmThinkingText }}</h2>
              <p class="thinking-elapsed">已等待 {{ thinkingElapsed }} 秒，请保持当前页面开启</p>
              <div class="reasoning-steps" aria-hidden="true">
                <span><i></i>读取上下文</span>
                <span><i></i>构建推理</span>
                <span><i></i>校验结果</span>
              </div>
              <div class="signal-bars" aria-hidden="true">
                <i v-for="index in 18" :key="index"></i>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </Teleport>

    <a-row :gutter="20">
      <a-col :xs="24" :lg="9">
        <a-card title="简历特征" class="panel">
          <template #extra>
            <a-space>
              <a-tag :color="featureSource === 'ai' ? 'blue' : 'default'">
                {{ featureSource === 'ai' ? 'AI 结果' : '本地结果' }}
              </a-tag>
              <a-button
                type="primary"
                size="small"
                :loading="featureLoading"
                :disabled="isBusy && !featureLoading"
                @click="extractFeaturesWithAi"
              >
                AI 提取
              </a-button>
            </a-space>
          </template>
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
          <template #extra>
            <a-space>
              <a-tag :color="recommendationSource === 'ai' ? 'blue' : 'default'">
                {{ recommendationSource === 'ai' ? 'AI 结果' : '本地结果' }}
              </a-tag>
              <a-button
                type="primary"
                size="small"
                :loading="recommendationLoading"
                :disabled="isBusy && !recommendationLoading"
                @click="recommendJobsWithAi"
              >
                AI 推荐
              </a-button>
            </a-space>
          </template>
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
            <a-space wrap>
              <a-tag color="purple" class="keyword-tag">{{ selectedRecommendation?.job.industry }}</a-tag>
              <a-tag :color="questionSource === 'ai' ? 'blue' : 'default'">
                {{ questionSource === 'ai' ? 'AI 题目' : '本地题库' }}
              </a-tag>
              <a-button
                type="primary"
                size="small"
                :loading="questionLoading"
                :disabled="isBusy && !questionLoading"
                @click="generateQuestionsWithAi"
              >
                AI 生成题目
              </a-button>
            </a-space>
          </template>

          <a-alert
            class="mode-alert"
            type="info"
            show-icon
            :message="llmReady
              ? '已配置 API。当前仍优先展示本地结果，只有点击对应的 AI 按钮才会调用大模型。'
              : '当前未配置通用 LLM API Key，所有模块均使用本地规则与题库。'"
          />

          <div v-if="selectedRecommendation" class="job-detail">
            <h3>岗位要求</h3>
            <ul>
              <li v-for="requirement in selectedRecommendation.job.requirements" :key="requirement">
                {{ requirement }}
              </li>
            </ul>
          </div>

          <a-spin :spinning="evaluationLoading">
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
              <template v-if="evaluation.strengths.length">
                <h3>优势</h3>
                <ul>
                  <li v-for="item in evaluation.strengths" :key="item">{{ item }}</li>
                </ul>
              </template>
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
                <div
                  class="question-analysis-columns"
                  :class="{ 'single-column': !item.strengths.length || !item.improvements.length }"
                >
                  <div v-if="item.strengths.length">
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
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
  fallbackQuestions,
  generateInterviewQuestions,
  recommendJobs,
  recommendJobsWithLlm,
} from '@/services/interviewJobs';

type ResultSource = 'local' | 'ai';

const resumeStore = useResumeStore();
const settingsStore = useSettingsStore();
const snapshot = computed(() => resumeStore.getResumeSnapshot());
const features = ref<ResumeFeatures>(extractResumeFeatures(snapshot.value));
const recommendations = ref<JobRecommendation[]>([]);
const selectedJobId = ref('');
const questions = ref<InterviewQuestion[]>([]);
const answers = reactive<Record<number, string>>({});
const evaluation = ref<InterviewEvaluation | null>(null);
const featureLoading = ref(false);
const recommendationLoading = ref(false);
const questionLoading = ref(false);
const evaluationLoading = ref(false);
const llmThinkingText = ref('');
const thinkingElapsed = ref(0);
const featureSource = ref<ResultSource>('local');
const recommendationSource = ref<ResultSource>('local');
const questionSource = ref<ResultSource>('local');
let thinkingTimer: number | undefined;
const llmReady = computed(() => Boolean(settingsStore.aliApiKey.trim() && settingsStore.aliApiUrl.trim()));
const isBusy = computed(() => (
  featureLoading.value
  || recommendationLoading.value
  || questionLoading.value
  || evaluationLoading.value
));

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

onMounted(() => {
  refreshLocalResults(true);
});

onUnmounted(() => {
  stopThinking();
});

function refreshLocalResults(silent = false) {
  features.value = extractResumeFeatures(snapshot.value);
  featureSource.value = 'local';
  recommendations.value = recommendJobs(features.value, undefined, 5);
  recommendationSource.value = 'local';
  selectedJobId.value = recommendations.value[0]?.job.id || '';
  refreshLocalQuestions();
  if (!silent) message.success('已重新生成全部本地结果。');
}

function selectJob(jobId: string) {
  selectedJobId.value = jobId;
  refreshLocalQuestions();
}

function refreshLocalQuestions() {
  const selected = selectedRecommendation.value;
  if (!selected) {
    questions.value = [];
    return;
  }

  applyQuestions(fallbackQuestions(features.value, selected.job, 5), 'local');
}

async function extractFeaturesWithAi() {
  if (!ensureLlmReady()) return;

  featureLoading.value = true;
  startThinking('正在深度解析简历特征');
  let llmError = '';

  try {
    const nextFeatures = await extractResumeFeaturesWithLlm(snapshot.value, (error) => {
      llmError = error;
    });

    if (llmError) {
      message.warning(`${formatLlmError(llmError)}，已保留当前本地特征。`);
      return;
    }

    features.value = nextFeatures;
    featureSource.value = 'ai';
    recommendations.value = recommendJobs(nextFeatures, undefined, 5);
    recommendationSource.value = 'local';
    selectedJobId.value = recommendations.value[0]?.job.id || '';
    refreshLocalQuestions();
    message.success('AI 简历特征提取完成，岗位和题目已按新特征在本地同步刷新。');
  } finally {
    featureLoading.value = false;
    stopThinking();
  }
}

async function recommendJobsWithAi() {
  if (!ensureLlmReady()) return;

  recommendationLoading.value = true;
  startThinking('正在推演更匹配的岗位方向');
  let llmError = '';

  try {
    const nextRecommendations = await recommendJobsWithLlm(features.value, undefined, 5, (error) => {
      llmError = error;
    });

    if (llmError) {
      message.warning(`${formatLlmError(llmError)}，已保留当前本地岗位推荐。`);
      return;
    }

    recommendations.value = nextRecommendations;
    recommendationSource.value = 'ai';
    selectedJobId.value = nextRecommendations[0]?.job.id || '';
    refreshLocalQuestions();
    message.success('AI 岗位推荐完成，面试题仍使用本地题库。');
  } finally {
    recommendationLoading.value = false;
    stopThinking();
  }
}

async function generateQuestionsWithAi() {
  if (!ensureLlmReady()) return;

  const selected = selectedRecommendation.value;
  if (!selected) return;

  questionLoading.value = true;
  startThinking('正在为当前岗位设计面试题');
  let llmError = '';

  try {
    const nextQuestions = await generateInterviewQuestions(
      features.value,
      selected.job,
      5,
      (error) => {
        llmError = error;
      }
    );

    if (llmError) {
      message.warning(`${formatLlmError(llmError)}，已保留当前本地题目。`);
      return;
    }

    applyQuestions(nextQuestions, 'ai');
    message.success('AI 面试题生成完成。');
  } finally {
    questionLoading.value = false;
    stopThinking();
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
    startThinking('正在分析你的面试表现');
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
    stopThinking();
  }
}

function applyQuestions(nextQuestions: InterviewQuestion[], source: ResultSource) {
  questions.value = nextQuestions;
  questionSource.value = source;
  evaluation.value = null;
  Object.keys(answers).forEach((key) => {
    delete answers[Number(key)];
  });
}

function ensureLlmReady(): boolean {
  if (llmReady.value) return true;
  message.warning('请先到“API配置”页填写 API Key，再使用 AI 增强。');
  return false;
}

function startThinking(text: string) {
  stopThinking();
  llmThinkingText.value = text;
  thinkingElapsed.value = 0;
  thinkingTimer = window.setInterval(() => {
    thinkingElapsed.value += 1;
  }, 1000);
}

function stopThinking() {
  if (thinkingTimer !== undefined) {
    window.clearInterval(thinkingTimer);
    thinkingTimer = undefined;
  }
  llmThinkingText.value = '';
  thinkingElapsed.value = 0;
}

function getQuestionText(questionId: number): string {
  return questions.value.find((question) => question.id === questionId)?.question || '';
}

function formatLlmError(error: string): string {
  if (error === 'E004') return '尚未配置可用的 API';
  if (error === 'REQUEST_TIMEOUT') return '大模型请求超过 5 分钟未返回';
  if (error === 'MODEL_NOT_FOUND') return '模型名称不存在或当前账号无权访问';
  if (error.startsWith('HTTP_401')) return `API Key 认证失败${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_403')) return `当前 API Key 没有调用权限${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_404')) return `API 地址或模型名称不正确${getLlmErrorDetail(error)}`;
  if (error.startsWith('HTTP_400')) return `请求参数或模型名称不正确${getLlmErrorDetail(error)}`;
  if (error === 'HTTP_429_RATE_LIMIT' || error === 'HTTP_429_COOLDOWN') return '大模型接口请求过于频繁';
  if (
    error === 'E005'
    || error === 'INVALID_FEATURE_RESPONSE'
    || error === 'INVALID_RECOMMENDATION_RESPONSE'
    || error === 'INVALID_QUESTION_RESPONSE'
  ) return '大模型返回的内容格式无法解析';
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

.ai-thinking-backdrop {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(4px);
}

.ai-thinking-stage {
  display: grid;
  grid-template-columns: minmax(250px, 0.9fr) minmax(300px, 1.1fr);
  align-items: center;
  width: clamp(620px, 52vw, 820px);
  min-height: min(52vh, 560px);
  padding: 40px;
  overflow: hidden;
  color: #172033;
  background: #f8fbff;
  border: 1px solid #8cb4f5;
  border-radius: 8px;
  box-shadow:
    inset 6px 0 #2563eb,
    inset -6px 0 #0f9f92,
    0 28px 80px rgba(15, 23, 42, 0.3);
}

.thinking-visual {
  position: relative;
  width: min(30vw, 300px);
  aspect-ratio: 1;
  margin: 0 auto;
}

.orbit,
.signal-node,
.thinking-core {
  position: absolute;
  top: 50%;
  left: 50%;
}

.orbit {
  border-radius: 50%;
}

.orbit-outer {
  width: 100%;
  height: 100%;
  border: 2px dashed #2563eb;
  animation: orbit-clockwise 8s linear infinite;
}

.orbit-middle {
  width: 72%;
  height: 72%;
  border: 3px solid #0f9f92;
  border-right-color: transparent;
  border-left-color: #f9735b;
  animation: orbit-counter 5s linear infinite;
}

.orbit-inner {
  width: 44%;
  height: 44%;
  border: 2px dotted #7259d6;
  animation: orbit-clockwise 3.6s linear infinite;
}

.thinking-core {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  color: #ffffff;
  background: #172033;
  border: 3px solid #ffffff;
  border-radius: 8px;
  box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.14);
  font-size: 24px;
  font-weight: 800;
  transform: translate(-50%, -50%);
  animation: core-pulse 1.8s ease-in-out infinite;
}

.signal-node {
  width: 14px;
  height: 14px;
  background: #f9735b;
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #f9735b;
}

.node-one {
  transform: translate(110px, -74px);
  animation: node-pulse 1.6s ease-in-out infinite;
}

.node-two {
  background: #0f9f92;
  box-shadow: 0 0 0 2px #0f9f92;
  transform: translate(-126px, 54px);
  animation: node-pulse 1.6s 0.35s ease-in-out infinite;
}

.node-three {
  background: #7259d6;
  box-shadow: 0 0 0 2px #7259d6;
  transform: translate(66px, 112px);
  animation: node-pulse 1.6s 0.7s ease-in-out infinite;
}

.thinking-copy {
  min-width: 0;
  padding-left: 32px;
}

.thinking-kicker {
  margin: 0 0 12px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.thinking-copy h2 {
  margin: 0;
  color: #172033;
  font-size: 28px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.thinking-elapsed {
  margin: 12px 0 24px;
  color: #667085;
  line-height: 1.6;
}

.reasoning-steps {
  display: grid;
  gap: 11px;
  margin-bottom: 24px;
}

.reasoning-steps span {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #344054;
  font-size: 14px;
}

.reasoning-steps i {
  width: 10px;
  height: 10px;
  background: #2563eb;
  border-radius: 50%;
  animation: step-pulse 1.5s ease-in-out infinite;
}

.reasoning-steps span:nth-child(2) i {
  background: #0f9f92;
  animation-delay: 0.3s;
}

.reasoning-steps span:nth-child(3) i {
  background: #f9735b;
  animation-delay: 0.6s;
}

.signal-bars {
  display: flex;
  height: 52px;
  align-items: center;
  gap: 5px;
  padding: 0 2px;
}

.signal-bars i {
  flex: 1;
  min-width: 3px;
  max-width: 8px;
  height: 18%;
  background: #2563eb;
  animation: signal-wave 1.4s ease-in-out infinite;
}

.signal-bars i:nth-child(3n + 2) {
  background: #0f9f92;
}

.signal-bars i:nth-child(3n) {
  background: #f9735b;
}

.signal-bars i:nth-child(2n) {
  animation-delay: 0.14s;
}

.signal-bars i:nth-child(3n) {
  animation-delay: 0.28s;
}

.signal-bars i:nth-child(5n) {
  animation-delay: 0.42s;
}

.thinking-enter-active,
.thinking-leave-active {
  transition: opacity 0.24s ease;
}

.thinking-enter-from,
.thinking-leave-to {
  opacity: 0;
}

@keyframes orbit-clockwise {
  from {
    transform: translate(-50%, -50%) rotate(0);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

@keyframes orbit-counter {
  from {
    transform: translate(-50%, -50%) rotate(360deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(0);
  }
}

@keyframes core-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.96);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.05);
  }
}

@keyframes node-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

@keyframes step-pulse {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.45;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes signal-wave {
  0%,
  100% {
    height: 18%;
  }
  50% {
    height: 94%;
  }
}

.panel {
  margin-bottom: 20px;
  border-radius: 8px;
}

.panel :deep(.ant-card-head-wrapper) {
  gap: 12px;
  flex-wrap: wrap;
}

.panel :deep(.ant-card-extra) {
  margin-inline-start: auto;
}

.mode-alert {
  margin-bottom: 16px;
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

.question-analysis-columns.single-column {
  grid-template-columns: 1fr;
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

  .ai-thinking-stage {
    grid-template-columns: 1fr;
    width: calc(100vw - 32px);
    min-height: auto;
    padding: 28px 22px;
  }

  .thinking-visual {
    width: min(58vw, 230px);
  }

  .thinking-copy {
    padding: 24px 0 0;
    text-align: center;
  }

  .thinking-copy h2 {
    font-size: 22px;
  }

  .reasoning-steps {
    width: fit-content;
    margin-right: auto;
    margin-left: auto;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .orbit,
  .thinking-core,
  .signal-node,
  .reasoning-steps i,
  .signal-bars i {
    animation-duration: 4s;
  }
}
</style>
