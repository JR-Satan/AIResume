import { createPinia } from 'pinia';
import { type App } from 'vue';

// 统一导出所有 Store 模块
export { useResumeStore } from './useResumeStore';
export {
  buildZhipuRealtimeWsUrl,
  sanitizeModelName,
  useSettingsStore,
  sanitizeBasicSpeechRate,
  sanitizeVoiceInterviewProvider,
  sanitizeZhipuRealtimeModel,
  sanitizeZhipuRealtimeUrl,
} from './useSettingsStore';
export { useUserStore } from './useUserStore';
export { useInterviewHistoryStore } from './useInterviewHistoryStore';
export { useResumeImportBus, importWarnings } from '../composables/useResumeImportBus';


const pinia = createPinia();
export function setupStores(app: App) {
  app.use(pinia);
}
