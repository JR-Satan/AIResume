import { Modal } from 'ant-design-vue';
import type { Router } from 'vue-router';
import { useSettingsStore } from '../store/useSettingsStore';

export const isApiConfigured = (): boolean => {
  const settingsStore = useSettingsStore();
  return Boolean(
    settingsStore.aliApiKey.trim() &&
    settingsStore.aliApiUrl.trim() &&
    settingsStore.modelName.trim()
  );
};

export const ensureApiConfigured = (router?: Router): boolean => {
  if (isApiConfigured()) return true;

  Modal.error({
    title: '未配置 API Key',
    content: '使用 AI 评分、润色、结构诊断或模拟面试前，请先到“API配置”页填写 API Key，并确认 API URL 和模型名称。',
    okText: '去配置',
    centered: true,
    onOk: () => {
      if (router) {
        router.push({ name: 'setting' });
      }
    }
  });

  return false;
};
