/**
 * 3-4 大模型润色组复用的统一 AI 请求入口。
 *
 * 本文件从网站配置页读取 API Key、API URL 和模型名称，再交给 worker 池执行请求。
 * 3-4 的评分、润色和结构诊断都通过这里调用模型，避免在业务文件中硬编码密钥。
 */
import { computed } from "vue";
import { useSettingsStore } from "../store/useSettingsStore";
import type { DialogueHistory } from "../types/aiDialogue";
import { WorkerPool } from "../worker/workerPool";

//读取用户设置的API地址和API Key
const settingsStore = useSettingsStore();
const API_URL = computed(() => settingsStore.aliApiUrl);
const userApiKey = computed(() => settingsStore.aliApiKey);
const model = computed(() => settingsStore.modelName);
// 创建线程池，最多 4 个工作线程
const workerPool = new WorkerPool(4);

export type AIRequestOptions = Record<string, unknown>;
export type AIResponseHandler = (responseText: string, isComplete: boolean, error?: string) => void;

export async function sendToQwenAIDialogue(messages: DialogueHistory,
  onResponse: AIResponseHandler,
  requestOptions?: AIRequestOptions): Promise<void> {
  workerPool.execute(messages, userApiKey.value, model.value, API_URL.value, onResponse, requestOptions);
}
