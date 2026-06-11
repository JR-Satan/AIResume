/**
 * 3-5 模拟面试及职位推送组
 * 本文件封装浏览器语音识别、语音播报和语音能力检测。
 */

import type {
  VoiceInterviewCapability,
  VoiceRecognitionOptions,
  VoiceRecognitionPayload
} from '@/types/interviewJobs';

type RecognitionResult = {
  readonly isFinal: boolean;
  readonly 0: {
    readonly transcript: string;
  };
};

type RecognitionResultList = {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
};

type RecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
};

type RecognitionErrorEvent = Event & {
  readonly error?: string;
};

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function getVoiceInterviewCapability(): VoiceInterviewCapability {
  const speechWindow = window as SpeechWindow;
  return {
    speechSynthesis: 'speechSynthesis' in window,
    speechRecognition: Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)
  };
}

export function speakInterviewText(text: string, lang = 'zh-CN'): boolean {
  if (!text.trim() || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopInterviewSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function createVoiceRecognizer(options: VoiceRecognitionOptions = {}): BrowserSpeechRecognition | null {
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = options.lang || 'zh-CN';
  recognition.continuous = options.continuous ?? true;
  recognition.interimResults = options.interimResults ?? true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const payloads = parseRecognitionEvent(event);
    payloads.forEach(payload => options.onResult?.(payload));
  };
  recognition.onerror = (event) => {
    options.onError?.(event.error || 'UNKNOWN_ERROR');
  };
  recognition.onend = () => {
    options.onEnd?.();
  };
  return recognition;
}

function parseRecognitionEvent(event: RecognitionEvent): VoiceRecognitionPayload[] {
  const payloads: VoiceRecognitionPayload[] = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result[0]?.transcript?.trim();
    if (transcript) {
      payloads.push({
        transcript,
        isFinal: result.isFinal
      });
    }
  }
  return payloads;
}
