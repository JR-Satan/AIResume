/**
 * 3-5 模拟面试及职位推送组
 * 本文件封装实时语音 WebSocket 会话、音频输入输出和服务端事件处理。
 */

/**
 * 智谱 GLM-Realtime 实时对话客户端
 *
 * 负责：
 * 1. 建立 / 关闭 WebSocket
 * 2. 发送 session.update
 * 3. 接收服务端事件并分类处理
 * 4. 协调 AudioCapture（输入）和 PcmPlayer（输出）
 * 5. 维护对话状态（用户/AI 文本、当前说话方等）
 *
 * 使用：
 *   const client = new RealtimeClient({ ... });
 *   await client.connect();
 *   await client.startMic();
 *   client.on('state', state => ...);
 *   client.on('event', evt => ...);
 *   client.disconnect();
 */

import { AudioCapture } from './audioCapture';
import { PcmPlayer } from './pcmPlayer';
import type {
  ClientEvent,
  ConversationItemInputAudioTranscriptionCompletedEvent,
  ErrorEvent,
  RealtimeSessionConfig,
  ResponseAudioDeltaEvent,
  ResponseAudioTranscriptDeltaEvent,
  ResponseAudioTranscriptDoneEvent,
  ResponseCreatedEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ServerEvent,
} from './types';

export type ConversationState =
  | 'idle'           // 未连接
  | 'connecting'     // 连接中
  | 'ready'          // 已连接但未开始对话
  | 'listening'      // 监听中（麦克风开着，等用户说话）
  | 'user_speaking'  // 检测到用户正在说话
  | 'ai_speaking'    // AI 正在回复
  | 'closed'         // 已关闭
  | 'error';         // 出错

export interface TranscriptSegment {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface FunctionCallRecord {
  name: string;
  arguments: string;
  parsedArgs: Record<string, unknown> | null;
  responseId: string;
  outputIndex: number;
}

export interface RealtimeClientConfig {
  /** 完整 WebSocket URL（带 Authorization 参数） */
  wsURL: string;
  /** session.update 要发的配置 */
  session: RealtimeSessionConfig;
}

export type ClientEventMap = {
  state: ConversationState;
  /** 任意服务端事件（用于调试日志） */
  rawEvent: ServerEvent;
  /** 用户/AI 文本片段（累积式） */
  transcript: TranscriptSegment;
  /** 完整的 AI 回复文本（response.text.done 时触发） */
  aiTextDone: { text: string; responseId: string };
  /** 完整的用户 ASR 文本（transcription.completed 时触发） */
  userTranscriptDone: { text: string; itemId: string };
  /** 收到 function call 调用 */
  functionCall: FunctionCallRecord;
  /** 麦克风实时音量（0-1） */
  volume: number;
  /** 每发出去一个 100ms 音频帧就触发一次,base64 长度 */
  audioChunk: { base64Length: number };
  /** 捕获统计：每 500ms 触发一次 */
  stats: { captured: number; sent: number };
  /** 出错 */
  error: { message: string; code?: string };
};

export class RealtimeClient {
  private config: RealtimeClientConfig;
  private ws: WebSocket | null = null;
  private audioCapture: AudioCapture | null = null;
  private pcmPlayer: PcmPlayer = new PcmPlayer();
  private listeners: Map<keyof ClientEventMap, Set<(payload: unknown) => void>> = new Map();
  private state: ConversationState = 'idle';
  private sessionReady = false;
  /** 当前正在进行的 response 累积文本 */
  private currentResponseText = '';
  /** 当前 session 内累积的 function calls（response.done 时清空） */
  private pendingFunctionCalls: FunctionCallRecord[] = [];
  /** 当前是否在播放 AI 语音 */
  private aiIsSpeaking = false;
  /** 已记录过的 responseId（防止重复 push 同一轮 AI 文本到对话区） */
  private completedResponseIds = new Set<string>();
  /** 已记录过的 userItemId（防止重复 push 同一段用户 ASR） */
  private completedUserItemIds = new Set<string>();
  /** AI 正在生成 response 期间,忽略新的 onSpeechEnd(避免重复触发) */
  private isGenerating = false;
  /** 暴露给 UI 的统计：捕获的总帧数（onaudioprocess 触发次数） */
  private totalCapturedFrames = 0;
  /** 暴露给 UI 的统计：实际发出去的帧数（100ms 一帧） */
  private totalSentFrames = 0;

  constructor(config: RealtimeClientConfig) {
    this.config = config;
  }

  // === 事件订阅 ===

  on<K extends keyof ClientEventMap>(
    event: K,
    listener: (payload: ClientEventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (p: unknown) => void);
    return () => {
      this.listeners.get(event)?.delete(listener as (p: unknown) => void);
    };
  }

  private emit<K extends keyof ClientEventMap>(event: K, payload: ClientEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        (fn as (p: ClientEventMap[K]) => void)(payload);
      } catch (err) {
        console.error(`[RealtimeClient] listener for "${event}" threw:`, err);
      }
    });
  }

  // === 生命周期 ===

  getState(): ConversationState {
    return this.state;
  }

  private setState(state: ConversationState) {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }

  async connect(): Promise<void> {
    if (this.ws) return;
    this.setState('connecting');
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsURL);
      } catch (err) {
        this.setState('error');
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('error', { message: error.message });
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        this.sendEvent({
          type: 'session.update',
          session: this.config.session,
        });
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ServerEvent;
          this.handleServerEvent(data);
          if (data.type === 'session.updated' && !this.sessionReady) {
            this.sessionReady = true;
            this.setState('ready');
            resolve();
          }
        } catch (err) {
          this.emit('error', { message: `parse error: ${err}` });
        }
      };

      this.ws.onerror = () => {
        this.emit('error', { message: 'WebSocket 发生错误（详见 onclose）' });
      };

      this.ws.onclose = (e) => {
        this.sessionReady = false;
        this.ws = null;
        if (e.code !== 1000) {
          this.setState('error');
          this.emit('error', {
            message: `连接关闭 code=${e.code} reason=${e.reason || '无'}`,
            code: String(e.code),
          });
        } else {
          this.setState('closed');
        }
        if (this.state !== 'error') {
          // resolve 已处理过的不再 reject
        }
      };
    });
  }

  async startMic(): Promise<void> {
    if (!this.sessionReady) throw new Error('会话未就绪');
    if (this.audioCapture) return;

    this.audioCapture = new AudioCapture({
      onAudioChunk: (base64) => {
        this.emit('audioChunk', { base64Length: base64.length });
        this.sendEvent({ type: 'input_audio_buffer.append', audio: base64 });
      },
      onVolume: (rms) => {
        this.emit('volume', rms);
      },
      onSpeechStart: () => {
        // 客户端 VAD:用户开始说话
        // 打断 AI 正在生成的回复(如果 AI 正在说话)
        if (this.isGenerating) {
          this.sendEvent({ type: 'response.cancel' });
          // 立即把 isGenerating 置 false,这样后续 onSpeechEnd 不会撞上
          this.isGenerating = false;
          // 停止正在播放的 AI 语音
          this.pcmPlayer.interrupt();
        }
        this.setState('user_speaking');
      },
      onSpeechEnd: () => {
        // 客户端 VAD:用户停止说话 -> 提交音频 + 触发 AI 回复
        // 防抖:如果 AI 还在生成中(罕见边界情况),跳过
        if (this.isGenerating) return;
        this.sendEvent({ type: 'input_audio_buffer.commit' });
        this.sendEvent({ type: 'response.create' });
        this.isGenerating = true;
        this.setState('ai_speaking');
      },
      onError: (err) => {
        this.emit('error', { message: `麦克风错误：${err.message}` });
      },
    });
    await this.audioCapture.start();

    // 启动一个轻量轮询,把 AudioCapture 的统计同步到 client 字段
    this.startStatsPolling();

    this.setState('listening');
  }

  private statsTimer: number | null = null;
  private startStatsPolling() {
    if (this.statsTimer !== null) return;
    this.statsTimer = window.setInterval(() => {
      if (this.audioCapture) {
        this.totalCapturedFrames = this.audioCapture.capturedFrames;
        this.totalSentFrames = this.audioCapture.sentFrames;
        this.emit('stats', {
          captured: this.totalCapturedFrames,
          sent: this.totalSentFrames,
        });
      }
    }, 500);
  }

  private stopStatsPolling() {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  async stopMic(): Promise<void> {
    if (this.audioCapture) {
      await this.audioCapture.stop();
      this.audioCapture = null;
    }
    this.stopStatsPolling();
    if (this.state === 'listening' || this.state === 'user_speaking') {
      this.setState('ready');
    }
  }

  async disconnect(): Promise<void> {
    this.stopStatsPolling();
    await this.stopMic();
    await this.pcmPlayer.destroy();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.sessionReady = false;
    this.setState('closed');
  }

  // === 服务端事件分发 ===

  private handleServerEvent(data: ServerEvent) {
    // 触发原始事件（用于调试）
    this.emit('rawEvent', data);

    switch (data.type) {
      case 'error': {
        const errorEvent = data as ErrorEvent;
        this.emit('error', {
          message: errorEvent.error.message,
          code: errorEvent.error.code,
        });
        break;
      }

      case 'session.created':
      case 'session.updated':
        // connect() 里专门处理
        break;

      case 'input_audio_buffer.speech_started': {
        if (this.aiIsSpeaking) {
          // 用户在 AI 说话时插话，打断 AI
          this.pcmPlayer.interrupt();
          this.aiIsSpeaking = false;
        }
        this.setState('user_speaking');
        break;
      }

      case 'input_audio_buffer.speech_stopped': {
        // VAD 模式下服务端会自动触发 response.create
        if (this.audioCapture?.isRunning) {
          this.setState('ai_speaking');  // 等待 AI 回复
        }
        break;
      }

      case 'input_audio_buffer.committed': {
        // 客户端 VAD 模式下需要手动 response.create
        break;
      }

      case 'response.created': {
        const responseCreated = data as ResponseCreatedEvent;
        this.currentResponseText = '';
        void responseCreated.response.id;
        this.pendingFunctionCalls = [];
        this.aiIsSpeaking = true;
        this.setState('ai_speaking');
        break;
      }

      case 'response.audio.delta': {
        const audioDelta = data as ResponseAudioDeltaEvent;
        // 边流式返回边播放
        this.pcmPlayer.append(audioDelta.delta);
        break;
      }

      case 'response.audio.done': {
        // AI 音频输出结束（不一定回复结束）
        break;
      }

      case 'response.audio_transcript.delta': {
        const audioTranscriptDelta = data as ResponseAudioTranscriptDeltaEvent;
        // AI 说的文字片段（先于 audio 到达）
        this.currentResponseText += audioTranscriptDelta.delta;
        this.emit('transcript', {
          role: 'assistant',
          text: this.currentResponseText,
          timestamp: Date.now(),
        });
        break;
      }

      case 'response.audio_transcript.done': {
        const audioTranscriptDone = data as ResponseAudioTranscriptDoneEvent;
        // 过滤空文本 + 去重
        const text = audioTranscriptDone.transcript?.trim() ?? '';
        if (text && !this.completedResponseIds.has(audioTranscriptDone.response_id)) {
          this.completedResponseIds.add(audioTranscriptDone.response_id);
          this.emit('aiTextDone', {
            text,
            responseId: audioTranscriptDone.response_id,
          });
        }
        break;
      }

      case 'response.text.delta': {
        const textDelta = data as ResponseTextDeltaEvent;
        this.currentResponseText += textDelta.delta;
        this.emit('transcript', {
          role: 'assistant',
          text: this.currentResponseText,
          timestamp: Date.now(),
        });
        break;
      }

      case 'response.text.done': {
        const textDone = data as ResponseTextDoneEvent;
        const text = textDone.text?.trim() ?? '';
        if (text && !this.completedResponseIds.has(textDone.response_id)) {
          this.completedResponseIds.add(textDone.response_id);
          this.emit('aiTextDone', {
            text,
            responseId: textDone.response_id,
          });
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcriptionDone = data as ConversationItemInputAudioTranscriptionCompletedEvent;
        const text = transcriptionDone.transcript?.trim() ?? '';
        if (!text) break;  // 空文本不推（避免 UI 出现空气泡）
        if (this.completedUserItemIds.has(transcriptionDone.item_id)) break;  // 去重
        this.completedUserItemIds.add(transcriptionDone.item_id);
        this.emit('userTranscriptDone', {
          text,
          itemId: transcriptionDone.item_id,
        });
        this.emit('transcript', {
          role: 'user',
          text,
          timestamp: Date.now(),
        });
        break;
      }

      case 'response.function_call_arguments.done': {
        const functionCallDone = data as ResponseFunctionCallArgumentsDoneEvent;
        const args = (() => {
          try {
            return JSON.parse(functionCallDone.arguments);
          } catch {
            return null;
          }
        })();
        this.pendingFunctionCalls.push({
          name: functionCallDone.name,
          arguments: functionCallDone.arguments,
          parsedArgs: args,
          responseId: functionCallDone.response_id,
          outputIndex: functionCallDone.output_index,
        });
        this.emit('functionCall', this.pendingFunctionCalls[this.pendingFunctionCalls.length - 1]);
        break;
      }

      case 'response.done': {
        this.aiIsSpeaking = false;
        this.isGenerating = false;
        // 回到 listening 状态（如果麦克风还开着）
        if (this.audioCapture?.isRunning) {
          this.setState('listening');
        } else {
          this.setState('ready');
        }
        break;
      }

      case 'heartbeat':
        // 心跳事件，忽略
        break;

      default:
        // 未处理的事件不报错
        break;
    }
  }

  // === 发送事件 ===

  sendEvent(event: ClientEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(event));
  }

  /** 发送文本消息并触发回复（用于测试或文本对话模式） */
  sendTextAndRespond(text: string) {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.sendEvent({ type: 'response.create' });
  }

  /** 上报 function call 执行结果 */
  reportFunctionCallOutput(_callId: string, output: unknown) {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        output: typeof output === 'string' ? output : JSON.stringify(output),
      },
    });
    this.sendEvent({ type: 'response.create' });
  }

  /** 主动打断 AI 当前回复 */
  cancelResponse() {
    this.sendEvent({ type: 'response.cancel' });
  }
}
