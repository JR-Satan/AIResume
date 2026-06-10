import { sanitizeModelName, useSettingsStore } from '@/store';
import type { LlmJsonRequest, LlmJsonResponse } from '@/types/interviewJobs';
import { normalizeChatCompletionsUrl } from '@/utils/apiUrl';

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5 * 60_000;
let rateLimitCooldownUntil = 0;

export async function callInterviewLlmForJson<T>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
  const settings = useSettingsStore();
  const apiKey = settings.aliApiKey.trim();
  const apiUrl = settings.aliApiUrl.trim();
  if (!apiKey || !apiUrl) {
    return { success: false, error: 'E004' };
  }

  if (Date.now() < rateLimitCooldownUntil) {
    return { success: false, error: 'HTTP_429_COOLDOWN' };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const model = sanitizeModelName(request.model || settings.modelName || 'qwen-turbo');
    const response = await fetch(normalizeChatCompletionsUrl(apiUrl, model), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.2,
        stream: false,
        messages: [
          {
            role: 'system',
            content: `${request.systemPrompt}\n必须只输出合法 JSON，不要输出 Markdown。`,
          },
          { role: 'user', content: request.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        rateLimitCooldownUntil = Date.now() + getRetryAfterMs(response.headers);
        return { success: false, error: 'HTTP_429_RATE_LIMIT' };
      }

      const detail = await readErrorDetail(response);
      if (response.status === 404 && /model .* does not exist|model_not_found|do not have access/i.test(detail)) {
        return { success: false, error: 'MODEL_NOT_FOUND' };
      }

      return { success: false, error: detail ? `HTTP_${response.status}: ${detail}` : `HTTP_${response.status}` };
    }

    const payload = await response.json();
    const rawResponse = normalizeResponseContent(payload?.choices?.[0]?.message?.content);
    const data = parseJson<T>(rawResponse);
    return data ? { success: true, data, rawResponse } : { success: false, rawResponse, error: 'E005' };
  } catch (error) {
    if (controller.signal.aborted) {
      return { success: false, error: 'REQUEST_TIMEOUT' };
    }

    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (/429|rate limit|too many requests/i.test(message)) {
      rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      return { success: false, error: 'HTTP_429_RATE_LIMIT' };
    }

    return { success: false, error: message };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeResponseContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'text' in item) {
        return String((item as { text?: unknown }).text || '');
      }
      return '';
    })
    .join('');
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';

    try {
      const payload = JSON.parse(text);
      const message = payload?.error?.message || payload?.message || payload?.error;
      return String(message || '').replace(/\s+/g, ' ').slice(0, 200);
    } catch {
      return text.replace(/\s+/g, ' ').slice(0, 200);
    }
  } catch {
    return '';
  }
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return undefined;
    }
  }
}

function getRetryAfterMs(headers: Headers): number {
  const retryAfter = headers.get('Retry-After');
  if (!retryAfter) return RATE_LIMIT_COOLDOWN_MS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, RATE_LIMIT_COOLDOWN_MS);
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt)
    ? RATE_LIMIT_COOLDOWN_MS
    : Math.max(retryAt - Date.now(), RATE_LIMIT_COOLDOWN_MS);
}
