<!--
  3-5 模拟面试及职位推送组
  本组件负责展示候选人画像、目标岗位、环境检查和麦克风测试。
-->

<template>
  <div class="interview-setup">
    <div class="welcome-banner">
      <h2>准备开始语音面试</h2>
      <p class="subtitle">
        AI 面试官会根据你的简历和目标岗位，与你进行一场更贴近真实场景的语音面试。
      </p>
      <p class="provider-tip">
        基础语音版会使用浏览器语音识别、语音播报和通用 LLM 完成完整面试流程。
      </p>
    </div>

    <a-row :gutter="20" class="info-row">
      <a-col :xs="24" :lg="12">
        <a-card size="small" title="候选人画像" class="info-card">
          <div class="kv">
            <span>目标岗位:</span>
            <strong>{{ context?.candidate.targetPosition || '未填写' }}</strong>
          </div>
          <div class="kv">
            <span>学历:</span>
            <strong>{{ context?.candidate.educationLevel || '未填写' }}</strong>
          </div>
          <div class="kv">
            <span>工作经验:</span>
            <strong>{{ context?.candidate.experienceYears }} 年</strong>
          </div>
          <div class="kv kv-tags">
            <span>核心技能:</span>
            <div class="tag-stack">
              <a-tag
                v-for="skill in (context?.candidate.skills || []).slice(0, 5)"
                :key="skill"
                color="blue"
                class="multi-line-tag"
              >
                {{ skill }}
              </a-tag>
            </div>
          </div>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="12">
        <a-card size="small" title="目标岗位" class="info-card">
          <div class="kv">
            <span>岗位:</span>
            <strong>{{ context?.job.title || '未选择' }}</strong>
          </div>
          <div class="kv">
            <span>行业 / 级别:</span>
            <strong>{{ context?.job.industry }} / {{ context?.job.level }}</strong>
          </div>
          <div class="kv kv-tags">
            <span>关键词:</span>
            <div class="tag-cluster">
              <a-tag
                v-for="keyword in (context?.job.keywords || []).slice(0, 6)"
                :key="keyword"
                color="green"
                class="keyword-tag"
              >
                {{ keyword }}
              </a-tag>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <h3 class="section-title">面试概览</h3>
    <a-row :gutter="12" class="overview-row">
      <a-col :xs="24" :sm="8">
        <div class="overview-item">
          <div class="num">5</div>
          <div class="label">题目数量</div>
        </div>
      </a-col>
      <a-col :xs="24" :sm="8">
        <div class="overview-item">
          <div class="num">~ 15</div>
          <div class="label">预计时长(分钟)</div>
        </div>
      </a-col>
      <a-col :xs="24" :sm="8">
        <div class="overview-item">
          <div class="num">5 维</div>
          <div class="label">综合评分维度</div>
        </div>
      </a-col>
    </a-row>

    <h3 class="section-title">系统检查</h3>
    <a-row :gutter="12" class="check-row">
      <a-col :xs="24" :sm="8">
        <div class="check-item" :class="providerReady ? 'ok' : 'fail'">
          <span class="icon">{{ providerReady ? '✓' : '!' }}</span>
          <span class="label">基础语音能力</span>
        </div>
      </a-col>
      <a-col :xs="24" :sm="8">
        <div class="check-item" :class="hasResume ? 'ok' : 'fail'">
          <span class="icon">{{ hasResume ? '✓' : '!' }}</span>
          <span class="label">简历数据</span>
        </div>
      </a-col>
      <a-col :xs="24" :sm="8">
        <div class="check-item" :class="micTested ? 'ok' : 'pending'">
          <span class="icon">{{ micTested ? '✓' : '?' }}</span>
          <span class="label">麦克风测试</span>
        </div>
      </a-col>
    </a-row>

    <a-card size="small" class="mic-test-card">
      <template #title>
        <span>麦克风测试 <span class="optional">(可选，但建议)</span></span>
      </template>

      <div v-if="!micTesting && !micTested">
        <a-button type="primary" ghost @click="startMicTest">开始测试</a-button>
        <p class="test-tip">点击后请允许浏览器使用麦克风，然后说几句话测试音量。</p>
      </div>

      <div v-else-if="micTested" class="mic-result">
        <div class="volume-bar">
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: testVolumePercent + '%' }" />
          </div>
          <span class="value">{{ testVolumePercent }}%</span>
        </div>
        <p class="test-tip" v-if="testVolumePercent > 5">麦克风工作正常，可以开始面试。</p>
        <p class="test-tip" v-else>音量偏小，建议靠近麦克风或调高输入音量。</p>
        <a-button size="small" @click="resetMicTest">重新测试</a-button>
      </div>
    </a-card>

    <h3 class="section-title">面试提示</h3>
    <ul class="tips-list">
      <li>找一个安静的环境，关闭其他应用通知。</li>
      <li>建议佩戴耳机，避免 AI 播报声音再次被麦克风收录。</li>
      <li>自然回答，尽量像和真实面试官对话一样表达。</li>
      <li>回答不必过长，但尽量有结构、有细节、有结果。</li>
    </ul>

    <div class="start-area">
      <a-alert
        v-if="!providerReady"
        type="error"
        message="请先配置通用 LLM API，并使用支持语音识别和语音播报的浏览器。"
        style="margin-bottom: 16px;"
      />
      <a-alert
        v-else-if="!hasResume"
        type="error"
        message="请先在简历制作页面完善简历内容。"
        style="margin-bottom: 16px;"
      />
      <a-button
        type="primary"
        size="large"
        :disabled="!canStart"
        :loading="loading"
        @click="$emit('start')"
      >
        开始面试
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { InterviewContext } from '@/services/interviewJobs/realtime';

const props = defineProps<{
  context: InterviewContext | null;
  providerReady: boolean;
  hasResume: boolean;
  loading: boolean;
}>();

defineEmits<{
  (e: 'start'): void;
}>();

const canStart = computed(() => props.providerReady && props.hasResume);

const micTesting = ref(false);
const micTested = ref(false);
const testVolume = ref(0);
const testVolumePercent = computed(() => Math.round(testVolume.value * 100));

let testStream: MediaStream | null = null;
let testAudioContext: AudioContext | null = null;
let testSource: MediaStreamAudioSourceNode | null = null;
let testProcessor: ScriptProcessorNode | null = null;

async function startMicTest() {
  try {
    testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    testAudioContext = new AudioContext({ sampleRate: 16000 });
    if (testAudioContext.state === 'suspended') {
      await testAudioContext.resume();
    }
    testSource = testAudioContext.createMediaStreamSource(testStream);
    testProcessor = testAudioContext.createScriptProcessor(2048, 1, 1);
    const silent = testAudioContext.createGain();
    silent.gain.value = 0;

    testProcessor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        sum += data[i] * data[i];
      }
      const rms = Math.sqrt(sum / data.length);
      testVolume.value = Math.min(1, rms * 4);
    };

    testSource.connect(testProcessor);
    testProcessor.connect(silent);
    silent.connect(testAudioContext.destination);
    micTesting.value = true;
    micTested.value = true;
  } catch (error) {
    console.error('麦克风测试失败', error);
  }
}

function resetMicTest() {
  cleanupMicTest();
  micTesting.value = false;
  micTested.value = false;
  testVolume.value = 0;
}

function cleanupMicTest() {
  try {
    testProcessor?.disconnect();
    testSource?.disconnect();
    if (testAudioContext && testAudioContext.state !== 'closed') {
      testAudioContext.close();
    }
  } catch {
    // ignore cleanup errors
  }

  if (testStream) {
    testStream.getTracks().forEach((track) => track.stop());
  }

  testStream = null;
  testAudioContext = null;
  testSource = null;
  testProcessor = null;
}

onBeforeUnmount(() => {
  cleanupMicTest();
});
</script>

<style scoped>
.interview-setup {
  padding: 8px 4px;
}

.welcome-banner {
  text-align: center;
  padding: 20px 0 28px;
}

.welcome-banner h2 {
  font-size: 24px;
  margin: 0 0 8px;
  color: #1e293b;
}

.welcome-banner .subtitle {
  color: #64748b;
  font-size: 13px;
  margin: 0;
  line-height: 1.7;
}

.provider-tip {
  margin: 16px auto 0;
  max-width: 560px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.info-row {
  margin-bottom: 24px;
}

.info-card {
  height: 100%;
}

.kv {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  align-items: flex-start;
}

.kv > span:first-child {
  color: #64748b;
  min-width: 80px;
  flex-shrink: 0;
}

.kv > strong {
  color: #1e293b;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.kv-tags {
  align-items: flex-start;
}

.tag-stack {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.tag-cluster {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
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

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 24px 0 12px;
}

.overview-row {
  margin-bottom: 8px;
}

.overview-item {
  background: linear-gradient(135deg, #f0f4ff, #e0e7ff);
  border-radius: 8px;
  padding: 20px 0;
  text-align: center;
}

.overview-item .num {
  font-size: 28px;
  font-weight: 700;
  color: #3653c9;
}

.overview-item .label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.check-row {
  margin-bottom: 20px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 13px;
}

.check-item .label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.check-item .icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.check-item.ok {
  background: #ecfdf5;
  color: #065f46;
}

.check-item.ok .icon {
  background: #10b981;
  color: white;
}

.check-item.fail {
  background: #fef2f2;
  color: #991b1b;
}

.check-item.fail .icon {
  background: #ef4444;
  color: white;
}

.check-item.pending {
  background: #f8fafc;
  color: #64748b;
}

.check-item.pending .icon {
  background: #cbd5e1;
  color: white;
}

.mic-test-card {
  margin-bottom: 16px;
}

.optional {
  color: #94a3b8;
  font-weight: 400;
  font-size: 12px;
}

.test-tip {
  color: #64748b;
  font-size: 12px;
  margin: 8px 0 0;
  line-height: 1.6;
}

.mic-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.volume-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.bar-track {
  flex: 1;
  height: 10px;
  background: #e5e7eb;
  border-radius: 5px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(to right, #10b981, #f59e0b, #ef4444);
  transition: width 0.05s ease;
}

.value {
  font-size: 12px;
  min-width: 40px;
  text-align: right;
  color: #475569;
  font-weight: 600;
}

.tips-list {
  background: #f8fafc;
  border-radius: 6px;
  padding: 12px 16px 12px 32px;
  margin: 0 0 24px;
  color: #475569;
  font-size: 13px;
  line-height: 2;
}

.tips-list li {
  margin: 0;
  overflow-wrap: anywhere;
}

.start-area {
  text-align: center;
  padding: 16px 0 8px;
}

@media (max-width: 900px) {
  .overview-item {
    padding: 16px 12px;
  }
}

@media (max-width: 768px) {
  .kv {
    flex-direction: column;
    gap: 4px;
  }

  .kv > span:first-child {
    min-width: 0;
  }
}
</style>
