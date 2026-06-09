<template>
  <div class="settings-container">
    <a-card class="settings-card" :bordered="false">
      <h2 class="title">必要设置</h2>

      <!-- 说明文字 -->
      <p class="tips">
        注意：此处调用接口使用 OpenAI 兼容格式。当前默认配置为 DeepSeek，
        如果不会配置，只需要填写 API Key。
      </p>
      <div class="input-group">
        <label for="model-name">大模型名称<span style="color:red">（不懂勿改）</span></label>
        <a-input id="model-name" v-model:value="settingsStore.modelName" placeholder="请输入模型名称" />
        <p class="tips">
          DeepSeek 推荐使用 deepseek-v4-pro。当前默认值为 deepseek-v4-pro。
          <a href="https://api-docs.deepseek.com/" target="_blank">
            查看 DeepSeek API 文档
          </a>。
        </p>
      </div>

      <div class="input-group">
        <label for="api-key">API Key（使用大模型）</label>
        <a-input-password id="api-key" v-model:value="settingsStore.aliApiKey" placeholder="请输入 API Key" />
        <p class="tips">
          请填写 DeepSeek API Key。Key 只保存在当前浏览器本地，请勿提交到代码仓库。
        </p>
      </div>

      <div class="input-group">
        <label for="api-url">API URL<span style="color:red">（不懂勿改）</span></label>
        <a-input id="api-url" v-model:value="settingsStore.aliApiUrl" placeholder="请输入 API URL" />
        <p class="tips">
          本地开发默认使用 /deepseek-api/chat/completions，由 Vite 代理转发到 DeepSeek。
          生产部署时请改成自己的后端或反向代理地址。
          <a href="https://api-docs.deepseek.com/api/create-chat-completion" target="_blank">
            查看 Chat Completions 文档
          </a>。
        </p>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../store/useSettingsStore';
const settingsStore = useSettingsStore();
</script>

<style scoped>
.settings-container {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
}

.settings-card {
  width: 100%;
  max-width: 600px;
  background: var(--card-color);
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
  color: var(--text-color);
}

.title {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 24px;
  text-align: center;
  color: var(--primary-color);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

label {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-color);
}

.tips {
  font-size: 13px;
  background: rgba(0, 0, 0, 0.05);
  padding: 10px;
  border-radius: 8px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  text-align: justify;
}

.tips a {
  color: var(--primary-color);
  font-weight: 600;
  text-decoration: none;
  transition: color 0.3s;
}

.tips a:hover {
  color: var(--primary-color-hover);
  text-decoration: underline;
}
</style>
