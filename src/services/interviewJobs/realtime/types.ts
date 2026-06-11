/**
 * 3-5 模拟面试及职位推送组
 * 本文件定义实时语音会话配置、客户端事件和服务端事件的数据结构。
 */

/**
 * 智谱 GLM-Realtime 协议类型定义
 * 官方文档：https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-realtime
 *
 * 本文件只描述我们实际用到的字段，避免被 25+ 种事件的完整定义淹没。
 * 如果要扩展，按相同结构补全即可。
 */

// === 会话配置（client -> server） ===

export interface RealtimeSessionConfig {
  /** 模型名，默认 glm-realtime */
  model?: 'glm-realtime' | 'glm-realtime-flash' | 'glm-realtime-air';
  /** 启用模态：text / audio。建议测试时只开 text，上线开 ['text', 'audio'] */
  modalities?: Array<'text' | 'audio'>;
  /** 系统提示词（面试官人设） */
  instructions?: string;
  /** 音色 */
  voice?: string;
  /** 输入音频格式：pcm16 / pcm24 / wav */
  input_audio_format?: 'pcm16' | 'pcm24' | 'wav';
  /** 输出音频固定 pcm 24kHz */
  output_audio_format?: 'pcm';
  /** 降噪：远场(笔记本麦) / 近场(耳机麦) */
  input_audio_noise_reduction?: { type: 'far_field' | 'near_field' };
  /** VAD 配置：null 表示禁用（手动控制），server_vad 表示服务端托管 */
  turn_detection?: ServerVadConfig | null;
  /** Function Call 工具定义 */
  tools?: RealtimeTool[];
  temperature?: number;
  max_response_output_tokens?: number | 'inf';
  /** beta 实验字段 */
  beta_fields?: {
    chat_mode?: 'audio' | 'video_passive';
    tts_source?: 'e2e';
    auto_search?: boolean;
    greeting_config?: { enable: boolean; content: string };
  };
}

export interface ServerVadConfig {
  type: 'server_vad';
  /** VAD 检测到语音停止时自动触发回复 */
  create_response?: boolean;
  /** 用户插话时是否自动打断 AI 当前回复 */
  interrupt_response?: boolean;
  /** VAD 灵敏度阈值，0-1，默认 0.5 */
  threshold?: number;
  /** 语音前填充（ms），默认 300 */
  prefix_padding_ms?: number;
  /** 静音多久算停止（ms），默认 500 */
  silence_duration_ms?: number;
}

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// === 客户端事件 ===

export interface SessionUpdateEvent {
  type: 'session.update';
  session: RealtimeSessionConfig;
}

export interface InputAudioBufferAppendEvent {
  type: 'input_audio_buffer.append';
  /** base64 编码的 PCM 音频（16kHz/24kHz, 16-bit, mono） */
  audio: string;
}

export interface InputAudioBufferCommitEvent {
  type: 'input_audio_buffer.commit';
}

export interface InputAudioBufferClearEvent {
  type: 'input_audio_buffer.clear';
}

export interface ConversationItemCreateEvent {
  type: 'conversation.item.create';
  item: ConversationItem;
}

export interface ResponseCreateEvent {
  type: 'response.create';
}

export interface ResponseCancelEvent {
  type: 'response.cancel';
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ConversationItemCreateEvent
  | ResponseCreateEvent
  | ResponseCancelEvent;

export interface ConversationItem {
  type: 'message' | 'function_call' | 'function_call_output';
  object?: 'realtime.item';
  role?: 'user' | 'assistant' | 'system';
  content?: Array<{ type: string; text?: string; audio?: string }>;
  output?: string;
  name?: string;
  arguments?: string;
}

// === 服务端事件（按需声明） ===

export interface BaseServerEvent {
  type: string;
  event_id?: string;
}

export interface ErrorEvent extends BaseServerEvent {
  type: 'error';
  error: { type: string; code: string; message: string };
}

export interface SessionCreatedEvent extends BaseServerEvent {
  type: 'session.created';
  session: { id: string; model: string };
}

export interface SessionUpdatedEvent extends BaseServerEvent {
  type: 'session.updated';
  session: { id: string; model: string; voice?: string };
}

export interface InputAudioBufferSpeechStartedEvent extends BaseServerEvent {
  type: 'input_audio_buffer.speech_started';
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent extends BaseServerEvent {
  type: 'input_audio_buffer.speech_stopped';
  audio_end_ms: number;
  item_id: string;
}

export interface InputAudioBufferCommittedEvent extends BaseServerEvent {
  type: 'input_audio_buffer.committed';
  item_id: string;
}

export interface ResponseCreatedEvent extends BaseServerEvent {
  type: 'response.created';
  response: { id: string; status: string };
}

export interface ResponseDoneEvent extends BaseServerEvent {
  type: 'response.done';
  response: {
    id: string;
    status: string;
    usage?: {
      total_tokens: number;
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ResponseAudioDeltaEvent extends BaseServerEvent {
  type: 'response.audio.delta';
  delta: string;  // base64 PCM
  response_id: string;
  item_id: string;
}

export interface ResponseAudioDoneEvent extends BaseServerEvent {
  type: 'response.audio.done';
  response_id: string;
}

export interface ResponseAudioTranscriptDeltaEvent extends BaseServerEvent {
  type: 'response.audio_transcript.delta';
  delta: string;
  response_id: string;
}

export interface ResponseAudioTranscriptDoneEvent extends BaseServerEvent {
  type: 'response.audio_transcript.done';
  transcript: string;
  response_id: string;
}

export interface ResponseTextDeltaEvent extends BaseServerEvent {
  type: 'response.text.delta';
  delta: string;
  response_id: string;
}

export interface ResponseTextDoneEvent extends BaseServerEvent {
  type: 'response.text.done';
  text: string;
  response_id: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends BaseServerEvent {
  type: 'response.function_call_arguments.done';
  name: string;
  arguments: string;  // JSON 字符串
  response_id: string;
  output_index: number;
}

export interface ConversationItemInputAudioTranscriptionCompletedEvent extends BaseServerEvent {
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  transcript: string;
}

export type ServerEvent =
  | ErrorEvent
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferCommittedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | BaseServerEvent;  // heartbeat 等未声明的事件
