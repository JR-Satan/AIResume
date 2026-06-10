import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
  DEEPSEEK_CHAT_COMPLETIONS_API_URL,
  DEFAULT_ZHIPU_REALTIME_URL,
} from '../utils/apiUrl';

export type ZhipuRealtimeModel = 'glm-realtime-flash' | 'glm-realtime-air';
export const ZHIPU_REALTIME_MODELS: readonly ZhipuRealtimeModel[] = [
  'glm-realtime-flash',
  'glm-realtime-air',
];

export type ZhipuRealtimeVoice =
  | 'tongtong'
  | 'xiaochen'
  | 'female-tianmei'
  | 'female-shaonv'
  | 'male-qn-daxuesheng'
  | 'male-qn-jingying'
  | 'lovely_girl';

export type VoiceInterviewProvider = 'basic';
export const VOICE_INTERVIEW_PROVIDERS: readonly VoiceInterviewProvider[] = ['basic'];

const LEGACY_INVALID_MODEL_NAMES = new Set([
  'glm-4o-audio-9b-biz',
  'glm-4o-audio',
  'glm-4o-audio-9b',
  'glm-4o',
]);

const DEFAULT_MODEL_NAME = 'deepseek-v4-pro';
const DEFAULT_ZHIPU_REALTIME_MODEL: ZhipuRealtimeModel = 'glm-realtime-flash';
const DEFAULT_VOICE_INTERVIEW_PROVIDER: VoiceInterviewProvider = 'basic';
const DEFAULT_BASIC_SPEECH_RATE = 1.15;
const MIN_BASIC_SPEECH_RATE = 0.9;
const MAX_BASIC_SPEECH_RATE = 1.35;

export function sanitizeModelName(value: string | null | undefined): string {
  const normalized = (value || '').trim();
  if (!normalized || LEGACY_INVALID_MODEL_NAMES.has(normalized)) {
    return DEFAULT_MODEL_NAME;
  }
  return normalized;
}

export function sanitizeZhipuRealtimeModel(value: string | null | undefined): ZhipuRealtimeModel {
  if (value && ZHIPU_REALTIME_MODELS.includes(value as ZhipuRealtimeModel)) {
    return value as ZhipuRealtimeModel;
  }
  return DEFAULT_ZHIPU_REALTIME_MODEL;
}

export function sanitizeVoiceInterviewProvider(_value: string | null | undefined): VoiceInterviewProvider {
  return DEFAULT_VOICE_INTERVIEW_PROVIDER;
}

export function sanitizeBasicSpeechRate(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_BASIC_SPEECH_RATE;
  }
  return Math.min(MAX_BASIC_SPEECH_RATE, Math.max(MIN_BASIC_SPEECH_RATE, value));
}

export function sanitizeZhipuRealtimeUrl(value: string | null | undefined): string {
  if (!value) return DEFAULT_ZHIPU_REALTIME_URL;

  try {
    const input = new URL(value);
    const official = new URL(DEFAULT_ZHIPU_REALTIME_URL);
    const protocolValid = input.protocol === 'wss:' || input.protocol === 'ws:';
    const hostValid = input.host === official.host;
    const pathValid = input.pathname === official.pathname;

    if (!protocolValid || !hostValid || !pathValid) {
      return DEFAULT_ZHIPU_REALTIME_URL;
    }
    return `${official.protocol}//${official.host}${official.pathname}`;
  } catch {
    return DEFAULT_ZHIPU_REALTIME_URL;
  }
}

export function buildZhipuRealtimeWsUrl(
  baseUrl: string | null | undefined,
  apiKey: string | null | undefined
): string {
  const normalizedBase = sanitizeZhipuRealtimeUrl(baseUrl);
  return `${normalizedBase}?Authorization=${encodeURIComponent(apiKey || '')}`;
}

removeLegacyPersistedApiKeys();
normalizePersistedSettings();

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const isDark = ref<boolean>(localStorage.getItem('theme') === 'dark');
    const theme = ref<string>(isDark.value ? '#9c87fe' : '#672DEA');
    const aliApiKey = ref<string>('');
    const aliApiUrl = ref<string>(import.meta.env.VITE_API_URL || DEEPSEEK_CHAT_COMPLETIONS_API_URL);
    const modelName = ref<string>(DEFAULT_MODEL_NAME);

    const zhipuApiKey = ref<string>('');
    const zhipuModel = ref<ZhipuRealtimeModel>(DEFAULT_ZHIPU_REALTIME_MODEL);
    const zhipuVoice = ref<ZhipuRealtimeVoice>('tongtong');
    const zhipuRealtimeUrl = ref<string>(DEFAULT_ZHIPU_REALTIME_URL);
    const voiceInterviewProvider = ref<VoiceInterviewProvider>(DEFAULT_VOICE_INTERVIEW_PROVIDER);
    const basicSpeechRate = ref<number>(DEFAULT_BASIC_SPEECH_RATE);

    const toggleTheme = () => {
      isDark.value = !isDark.value;
      theme.value = isDark.value ? '#9c87fe' : '#672DEA';
      localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', isDark.value);
    };

    const initTheme = () => {
      isDark.value = localStorage.getItem('theme') === 'dark';
      theme.value = isDark.value ? '#9c87fe' : '#672DEA';
      document.documentElement.classList.toggle('dark', isDark.value);
    };

    watch(isDark, (value) => {
      theme.value = value ? '#9c87fe' : '#672DEA';
      document.documentElement.classList.toggle('dark', value);
    });

    watch(modelName, (value) => {
      const sanitized = sanitizeModelName(value);
      if (value !== sanitized) modelName.value = sanitized;
    }, { immediate: true });

    watch(zhipuModel, (value) => {
      const sanitized = sanitizeZhipuRealtimeModel(value);
      if (value !== sanitized) zhipuModel.value = sanitized;
    }, { immediate: true });

    watch(zhipuRealtimeUrl, (value) => {
      const sanitized = sanitizeZhipuRealtimeUrl(value);
      if (value !== sanitized) zhipuRealtimeUrl.value = sanitized;
    }, { immediate: true });

    watch(voiceInterviewProvider, (value) => {
      const sanitized = sanitizeVoiceInterviewProvider(value);
      if (value !== sanitized) voiceInterviewProvider.value = sanitized;
    }, { immediate: true });

    watch(basicSpeechRate, (value) => {
      const sanitized = sanitizeBasicSpeechRate(value);
      if (value !== sanitized) basicSpeechRate.value = sanitized;
    }, { immediate: true });

    return {
      isDark,
      theme,
      toggleTheme,
      initTheme,
      aliApiKey,
      aliApiUrl,
      modelName,
      voiceInterviewProvider,
      basicSpeechRate,
      zhipuApiKey,
      zhipuModel,
      zhipuVoice,
      zhipuRealtimeUrl,
    };
  },
  {
    persist: {
      pick: [
        'isDark',
        'theme',
        'aliApiUrl',
        'modelName',
        'voiceInterviewProvider',
        'basicSpeechRate',
        'zhipuModel',
        'zhipuVoice',
        'zhipuRealtimeUrl',
      ],
    },
  }
);

function removeLegacyPersistedApiKeys() {
  const persistedSettings = localStorage.getItem('settings');
  if (!persistedSettings) return;

  try {
    const settings = JSON.parse(persistedSettings) as Record<string, unknown>;
    const hasAliApiKey = Object.prototype.hasOwnProperty.call(settings, 'aliApiKey');
    const hasZhipuApiKey = Object.prototype.hasOwnProperty.call(settings, 'zhipuApiKey');
    if (!hasAliApiKey && !hasZhipuApiKey) return;

    delete settings.aliApiKey;
    delete settings.zhipuApiKey;
    localStorage.setItem('settings', JSON.stringify(settings));
  } catch {
    // Keep unrelated settings untouched if historical data cannot be parsed.
  }
}

function normalizePersistedSettings() {
  const persistedSettings = localStorage.getItem('settings');
  if (!persistedSettings) return;

  try {
    const settings = JSON.parse(persistedSettings) as Record<string, unknown>;
    let changed = false;

    const normalizedModelName = sanitizeModelName(String(settings.modelName ?? ''));
    if (settings.modelName !== normalizedModelName) {
      settings.modelName = normalizedModelName;
      changed = true;
    }

    const normalizedProvider = sanitizeVoiceInterviewProvider(String(settings.voiceInterviewProvider ?? ''));
    if (settings.voiceInterviewProvider !== normalizedProvider) {
      settings.voiceInterviewProvider = normalizedProvider;
      changed = true;
    }

    const normalizedRealtimeModel = sanitizeZhipuRealtimeModel(String(settings.zhipuModel ?? ''));
    if (settings.zhipuModel !== normalizedRealtimeModel) {
      settings.zhipuModel = normalizedRealtimeModel;
      changed = true;
    }

    const normalizedSpeechRate = sanitizeBasicSpeechRate(Number(settings.basicSpeechRate));
    if (settings.basicSpeechRate !== normalizedSpeechRate) {
      settings.basicSpeechRate = normalizedSpeechRate;
      changed = true;
    }

    if (changed) {
      localStorage.setItem('settings', JSON.stringify(settings));
    }
  } catch {
    // Ignore malformed historical persisted data.
  }
}
