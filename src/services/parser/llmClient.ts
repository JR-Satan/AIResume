import { useSettingsStore } from '../../store/useSettingsStore';

export interface LlmJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

export interface LlmJsonResponse<T> {
  success: boolean;
  data?: T;
  rawResponse?: string;
  error?: string;
}

export async function callLlmForJson(
  request: LlmJsonRequest
): Promise<LlmJsonResponse<string>> {
  const settingsStore = useSettingsStore();
  const apiKey = settingsStore.aliApiKey?.trim();
  const apiUrl = settingsStore.aliApiUrl?.trim();

  if (!apiKey) {
    return { success: false, error: 'E004' };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model ?? settingsStore.modelName,
        temperature: request.temperature ?? 0.1,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        stream: false,
      }),
    });

    if (response.status === 401) {
      return { success: false, error: '认证失败，请检查 API Key' };
    }
    if (!response.ok) {
      return { success: false, error: `请求失败，错误码: ${response.status}` };
    }

    const json = await response.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, error: '模型未返回有效内容' };
    }

    return { success: true, data: content, rawResponse: content };
  } catch (err) {
    console.error('LLM request failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'AI 解析请求失败',
    };
  }
}
