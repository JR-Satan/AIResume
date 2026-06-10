<template>
  <main class="settings-page">
    <a-card class="settings-card" :bordered="false">
      <h1 class="title">API配置</h1>

      <p class="tips">
        这里的通用大模型配置同时用于简历 AI 润色、结构诊断、岗位推荐、文本面试和基础语音面试。
      </p>

      <h2 class="section-title">通用大模型</h2>

      <div class="input-group">
        <label for="model-name">模型名称 <span class="danger">不熟悉时保持默认</span></label>
        <a-input
          id="model-name"
          v-model:value="settingsStore.modelName"
          placeholder="deepseek-v4-pro"
        />
        <p class="help">
          当前沿用主项目的 DeepSeek 默认配置，也可填写其他兼容 OpenAI Chat Completions 的模型名称。
        </p>
      </div>

      <div class="input-group">
        <label for="api-key">API Key</label>
        <a-input-password
          id="api-key"
          v-model:value="settingsStore.aliApiKey"
          placeholder="请输入 API Key"
        />
        <p class="help">
          API Key 会保存在当前浏览器本地，用于简历 AI 润色、智能导入、岗位推荐和面试功能。
        </p>
      </div>

      <div class="input-group">
        <label for="api-url">API URL <span class="danger">不熟悉时保持默认</span></label>
        <a-input
          id="api-url"
          v-model:value="settingsStore.aliApiUrl"
          placeholder="https://api.deepseek.com/v1/chat/completions"
        />
        <p class="help">
          支持 DeepSeek、阿里云百炼等 OpenAI 兼容接口。本地开发也可以填写
          <code>/deepseek-api/chat/completions</code>
          使用项目自带代理。
        </p>
      </div>

      <a-divider />

      <h2 class="section-title">简历导入 OCR（可选）</h2>
      <p class="subtips">
        智能导入支持 JPG、PNG、PDF 简历识别。默认使用本地 Tesseract，无需额外 API。
      </p>

      <div class="input-group">
        <label>图片文字识别方式</label>
        <a-radio-group v-model:value="settingsStore.ocrEngine">
          <a-radio value="tesseract">本地 Tesseract（免费，无需 API）</a-radio>
          <a-radio value="vision">大模型视觉识别（效果更好，需 API Key）</a-radio>
        </a-radio-group>
        <p class="help">
          选择大模型视觉识别时，将使用下方视觉模型识别简历图片或 PDF 扫描件中的文字；识别失败会自动回退到 Tesseract。
        </p>
      </div>

      <div v-if="settingsStore.ocrEngine === 'vision'" class="input-group">
        <label for="vision-model">视觉 OCR 模型</label>
        <a-input
          id="vision-model"
          v-model:value="settingsStore.visionModelName"
          placeholder="例如 qwen-vl-max"
        />
        <p class="help">
          阿里云百炼常用：<code>qwen-vl-max</code>、<code>qwen-vl-plus</code>。该模型仅用于图片文字识别。
        </p>
      </div>

      <a-divider />

      <h2 class="section-title">基础语音面试</h2>
      <p class="subtips">
        基础语音面试使用浏览器语音识别和语音播报，并调用上面的通用大模型完成提问、追问与评分。
      </p>

      <div class="input-group">
        <label>播报语速</label>
        <a-slider
          v-model:value="settingsStore.basicSpeechRate"
          :min="0.9"
          :max="1.35"
          :step="0.05"
        />
        <p class="help">当前语速：{{ settingsStore.basicSpeechRate.toFixed(2) }}</p>
      </div>
    </a-card>
  </main>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../store/useSettingsStore';

const settingsStore = useSettingsStore();
</script>

<style scoped>
.settings-page {
  min-height: calc(100vh - 64px);
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  background: var(--page-bg, #f8fafc);
}

.settings-card {
  width: 100%;
  max-width: 720px;
  padding: 28px 32px;
  color: var(--text-color);
  background: var(--card-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.title {
  margin: 0 0 12px;
  color: var(--primary-color);
  font-size: 24px;
  text-align: center;
}

.tips {
  margin: 0 0 24px;
  padding: 12px 16px;
  color: var(--text-color-secondary);
  line-height: 1.7;
  background: rgba(54, 83, 201, 0.06);
  border-left: 3px solid var(--primary-color);
}

.section-title {
  margin: 0 0 16px;
  color: var(--text-color);
  font-size: 18px;
}

.subtips {
  margin: -8px 0 20px;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

label {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
}

.danger {
  margin-left: 4px;
  color: #d4380d;
  font-size: 12px;
  font-weight: 500;
}

.help {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.help code {
  padding: 1px 5px;
  color: #be185d;
  background: #f1f5f9;
}
</style>
