<template>
  <div class="ocr-progress">
    <a-spin :spinning="true" size="large" />
    <div class="progress-info">
      <h3>{{ stageLabel }}</h3>
      <a-progress :percent="percent" :status="percent >= 100 ? 'success' : 'active'" />
      <p class="hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../store/useSettingsStore';

const props = defineProps<{
  stage: 'ocr' | 'parsing';
  percent: number;
  fileName?: string;
}>();

const settingsStore = useSettingsStore();

const useVisionOcr = computed(
  () => settingsStore.ocrEngine === 'vision' && !!settingsStore.aliApiKey?.trim()
);

const stageLabel = computed(() => {
  if (props.stage === 'parsing') return '正在解析简历结构…';
  return useVisionOcr.value ? '正在用大模型识别文字…' : '正在识别文字…';
});

const hint = computed(() => {
  const name = props.fileName ? `「${props.fileName}」` : '文件';
  if (props.stage === 'parsing') {
    return `${name} 正在调用 AI 提取字段`;
  }
  return useVisionOcr.value
    ? `${name} 视觉模型识别中，请稍候`
    : `${name} OCR 识别中，请稍候`;
});
</script>

<style scoped>
.ocr-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 24px;
  min-height: 280px;
}

.progress-info {
  width: 100%;
  max-width: 420px;
  text-align: center;
}

.progress-info h3 {
  margin-bottom: 16px;
  color: var(--text-color, #333);
}

.hint {
  margin-top: 12px;
  color: #888;
  font-size: 13px;
}
</style>
