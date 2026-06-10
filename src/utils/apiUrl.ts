export const DEFAULT_CHAT_COMPLETIONS_API_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export const DEEPSEEK_CHAT_COMPLETIONS_API_URL =
  'https://api.deepseek.com/v1/chat/completions';

// 智谱 GLM-Realtime 实时语音 WebSocket 端点（官方固定）
// 鉴权方式：在 URL 末尾拼接 ?Authorization=<APIKey>
// 文档：https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-realtime
export const DEFAULT_ZHIPU_REALTIME_URL =
  'wss://open.bigmodel.cn/api/paas/v4/realtime';

export function getDefaultChatCompletionsUrl(model?: string): string {
  return isDeepSeekModel(model) ? DEEPSEEK_CHAT_COMPLETIONS_API_URL : DEFAULT_CHAT_COMPLETIONS_API_URL;
}

export function normalizeChatCompletionsUrl(url?: string, model?: string): string {
  const cleaned = (url || DEFAULT_CHAT_COMPLETIONS_API_URL)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '');
  const defaultUrl = getDefaultChatCompletionsUrl(model);

  if (!cleaned || cleaned === 'https://resumeai.404.pub') {
    return defaultUrl;
  }

  if (isDeepSeekModel(model) && isDashScopeDefaultUrl(cleaned)) {
    return DEEPSEEK_CHAT_COMPLETIONS_API_URL;
  }

  if (cleaned.endsWith('/chat/completions')) {
    return cleaned;
  }

  if (cleaned.endsWith('/v1') || cleaned.endsWith('/compatible-mode/v1')) {
    return `${cleaned}/chat/completions`;
  }

  return cleaned;
}

function isDeepSeekModel(model?: string): boolean {
  return (model || '').trim().toLowerCase().startsWith('deepseek');
}

function isDashScopeDefaultUrl(url: string): boolean {
  return url === DEFAULT_CHAT_COMPLETIONS_API_URL
    || url === 'https://dashscope.aliyuncs.com/compatible-mode/v1';
}
