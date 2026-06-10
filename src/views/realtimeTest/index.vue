<template>
  <div class="voice-interview-page">
    <a-card :bordered="false" class="page-card">
      <template #title>
        <div class="page-title">
          <div>
            <div class="eyebrow">正式版</div>
            <h1>AI 语音面试</h1>
            <p class="subtitle">
              基于当前简历自动匹配岗位，并使用基础语音能力完成完整语音面试。
            </p>
          </div>
          <a-button size="small" @click="showHistoryDrawer = true">
            面试历史（{{ historyStore.records.length }}）
          </a-button>
        </div>
      </template>

      <a-alert
        v-if="interviewError"
        type="error"
        show-icon
        :message="interviewError"
        closable
        style="margin-bottom: 16px;"
        @close="interviewError = ''"
      />

      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px;"
        message="基础版会使用浏览器语音能力与内部通用 LLM 完成提问、追问和评估。"
      />

      <InterviewSetup
        v-if="interviewState === 'idle' || interviewState === 'error' || interviewState === 'connecting'"
        :context="interviewContext"
        :provider-ready="isInterviewProviderReady"
        :has-resume="interviewContext !== null"
        :loading="interviewState === 'connecting'"
        @start="handleStartInterview"
      />

      <InterviewRoom
        v-else
        :state="interviewState"
        :mic-on="interviewMicOn"
        :volume="volume"
        :elapsed-seconds="elapsedSeconds"
        :current-question="currentQuestion"
        :answers="interviewAnswers"
        :transcripts="interviewTranscripts"
        @stop="handleStopInterview"
        @toggle-mic="toggleInterviewMic"
      />
    </a-card>

    <InterviewResultModal
      :open="showResultModal"
      :result="interviewResult"
      @close="handleCloseResultModal"
    />

    <InterviewHistoryDrawer
      :open="showHistoryDrawer"
      :records="historyStore.records"
      @close="showHistoryDrawer = false"
      @view="handleViewHistory"
      @delete="handleDeleteHistory"
      @clear-all="handleClearAllHistory"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  useInterviewHistoryStore,
  useResumeStore,
  useSettingsStore,
} from '@/store';
import type { InterviewRecord } from '@/store/useInterviewHistoryStore';
import {
  createInterviewOrchestrator,
  extractResumeFeatures,
  getVoiceInterviewCapability,
  recommendJobs,
  type InterviewOrchestratorLike,
} from '@/services/interviewJobs';
import type {
  InterviewContext,
  InterviewState,
  AnswerRecord,
  InterviewResult,
  InterviewDimension,
  TranscriptSegment,
} from '@/services/interviewJobs/realtime';
import InterviewSetup from './components/InterviewSetup.vue';
import InterviewRoom from './components/InterviewRoom.vue';
import InterviewResultModal from './components/InterviewResultModal.vue';
import InterviewHistoryDrawer from './components/InterviewHistoryDrawer.vue';

const settings = useSettingsStore();
const resumeStore = useResumeStore();
const historyStore = useInterviewHistoryStore();

const hasGeneralLlmConfig = computed(() => Boolean(settings.aliApiKey && settings.aliApiUrl));
const browserVoiceCapability = computed(() => getVoiceInterviewCapability());

const isInterviewProviderReady = computed(() => {
  return hasGeneralLlmConfig.value
    && browserVoiceCapability.value.speechRecognition
    && browserVoiceCapability.value.speechSynthesis;
});

const interviewContext = computed<InterviewContext | null>(() => {
  try {
    const snapshot = resumeStore.getResumeSnapshot();
    const features = extractResumeFeatures(snapshot);
    const recommendations = recommendJobs(features, undefined, 1);

    if (!recommendations.length) {
      return null;
    }

    return {
      candidate: features,
      job: recommendations[0].job,
    };
  } catch {
    return null;
  }
});

let orchestrator: InterviewOrchestratorLike | null = null;
const interviewState = ref<InterviewState>('idle');
const interviewMicOn = ref(false);
const interviewError = ref('');
const currentQuestion = ref<{ questionId: number; dimension: InterviewDimension } | null>(null);
const interviewAnswers = ref<AnswerRecord[]>([]);
const interviewTranscripts = ref<TranscriptSegment[]>([]);
const interviewResult = ref<InterviewResult | null>(null);
const showResultModal = ref(false);
const showHistoryDrawer = ref(false);
const elapsedSeconds = ref(0);
const volume = ref(0);

let timerHandle: number | null = null;
let orchestratorUnsubs: Array<() => void> = [];

function startTimer() {
  if (timerHandle !== null) return;

  elapsedSeconds.value = 0;
  timerHandle = window.setInterval(() => {
    elapsedSeconds.value += 1;
  }, 1000);
}

function stopTimer() {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  elapsedSeconds.value = 0;
}

function clearOrchestratorListeners() {
  orchestratorUnsubs.forEach((unsubscribe) => unsubscribe());
  orchestratorUnsubs = [];
}

function attachOrchestratorListeners(instance: InterviewOrchestratorLike) {
  clearOrchestratorListeners();

  orchestratorUnsubs.push(instance.on('state', (state) => {
    interviewState.value = state;
  }));

  orchestratorUnsubs.push(instance.on('currentQuestion', (question) => {
    currentQuestion.value = question;
  }));

  orchestratorUnsubs.push(instance.on('answerRecorded', (answer) => {
    interviewAnswers.value.push(answer);
  }));

  orchestratorUnsubs.push(instance.on('transcript', (segment) => {
    interviewTranscripts.value.push(segment);
  }));

  orchestratorUnsubs.push(instance.on('error', ({ message: nextMessage }) => {
    interviewError.value = nextMessage;
  }));

  orchestratorUnsubs.push(instance.on('completed', (result) => {
    interviewResult.value = result;
    showResultModal.value = true;
    interviewMicOn.value = false;
    stopTimer();

    historyStore.add({
      jobTitle: result.jobTitle,
      candidateTargetPosition: result.candidateTargetPosition,
      evaluation: {
        scores: result.dimensionScores,
        totalScore: result.overallScore,
        summary: result.summary,
        strengths: result.strengths,
        improvements: result.improvements,
      },
      answers: result.answers,
    });

    message.success('语音面试已完成，结果已保存到历史记录。');
  }));
}

async function handleStartInterview() {
  if (!interviewContext.value) {
    message.warning('请先完善简历内容，系统才能自动生成匹配岗位并开始语音面试。');
    return;
  }

  if (!isInterviewProviderReady.value) {
    message.warning('请先配置通用 LLM，并使用支持语音识别与语音播报的浏览器。');
    return;
  }

  interviewError.value = '';
  interviewAnswers.value = [];
  interviewTranscripts.value = [];
  interviewResult.value = null;
  currentQuestion.value = null;
  volume.value = 0;

  orchestrator = createInterviewOrchestrator('basic', interviewContext.value);
  attachOrchestratorListeners(orchestrator);

  try {
    await orchestrator.start();
    interviewMicOn.value = false;
    startTimer();
    message.success('基础版语音面试已开始，打开麦克风后即可正式作答。');
  } catch (error) {
    interviewError.value = error instanceof Error ? error.message : String(error);
    stopTimer();
  }
}

async function toggleInterviewMic() {
  if (!orchestrator) return;

  try {
    if (interviewMicOn.value) {
      await orchestrator.stopMic();
      interviewMicOn.value = false;
      return;
    }

    await orchestrator.startMic();
    interviewMicOn.value = true;
  } catch (error) {
    interviewError.value = error instanceof Error ? error.message : String(error);
  }
}

async function handleStopInterview() {
  if (orchestrator) {
    await orchestrator.stop();
    orchestrator = null;
  }

  clearOrchestratorListeners();
  interviewMicOn.value = false;
  interviewState.value = 'idle';
  currentQuestion.value = null;
  volume.value = 0;
  stopTimer();
  message.info('语音面试已结束。');
}

function handleCloseResultModal() {
  showResultModal.value = false;
}

function handleViewHistory(record: InterviewRecord) {
  showHistoryDrawer.value = false;
  interviewResult.value = {
    answers: (record.answers ?? []) as AnswerRecord[],
    overallScore: record.evaluation.totalScore,
    summary: record.evaluation.summary,
    strengths: record.evaluation.strengths,
    improvements: record.evaluation.improvements,
    transcript: [],
    dimensionScores: record.evaluation.scores,
    timestamp: record.timestamp,
    jobTitle: record.jobTitle,
    candidateTargetPosition: record.candidateTargetPosition,
  };
  showResultModal.value = true;
}

function handleDeleteHistory(id: string) {
  historyStore.remove(id);
  message.success('已删除该条面试记录。');
}

function handleClearAllHistory() {
  historyStore.clear();
  message.success('面试历史已清空。');
}

onBeforeUnmount(async () => {
  if (orchestrator) {
    await orchestrator.stop();
    orchestrator = null;
  }

  clearOrchestratorListeners();
  stopTimer();
});
</script>

<style scoped>
.voice-interview-page {
  max-width: 1320px;
  margin: 0 auto;
  padding: 28px;
}

.page-card {
  border-radius: 8px;
}

.page-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  color: #3653c9;
  font-weight: 700;
  letter-spacing: 0;
}

h1 {
  margin: 0;
  font-size: 28px;
  color: #1e293b;
}

.subtitle {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .voice-interview-page {
    padding: 16px;
  }

  .page-title {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
