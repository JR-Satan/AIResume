import { createPinia } from 'pinia';
import { type App } from 'vue';

// 统一导出所有 Store 模块
export { useResumeStore } from './useResumeStore';
export { useSettingsStore } from './useSettingsStore';
export { useUserStore } from './useUserStore';


const pinia = createPinia();
export function setupStores(app: App) {
  app.use(pinia);
}
