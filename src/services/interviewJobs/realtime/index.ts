/**
 * 智谱 GLM-Realtime 实时对话模块入口
 * 在外部统一从这里导入，避免直接碰内部文件
 */
export { RealtimeClient } from './realtimeClient';
export { AudioCapture } from './audioCapture';
export { PcmPlayer } from './pcmPlayer';
export { InterviewOrchestrator } from './interviewOrchestrator';
export { INTERVIEW_TOOLS, RECORD_ANSWER_TOOL, END_INTERVIEW_TOOL } from './interviewTools';
export { buildInterviewInstructions, buildGreeting } from './interviewPrompt';
export {
  convertFloat32ArrayToPCM16Base64,
  convertPCM16Base64ToFloat32Array,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  resample,
  chunkAudio,
  createWavBuffer,
} from './audioUtils';
export type {
  ConversationState,
  TranscriptSegment,
  FunctionCallRecord,
  RealtimeClientConfig,
  ClientEventMap,
} from './realtimeClient';
export type {
  InterviewContext,
} from './interviewPrompt';
export type {
  InterviewState,
  AnswerRecord,
  InterviewResult,
  OrchestratorEventMap,
} from './interviewOrchestrator';
export type {
  InterviewDimension,
} from '@/types/interviewJobs';
export type {
  RealtimeSessionConfig,
  ServerVadConfig,
  RealtimeTool,
  ClientEvent,
  ServerEvent,
  ConversationItem,
  SessionUpdateEvent,
  InputAudioBufferAppendEvent,
  ResponseCreateEvent,
  ResponseCancelEvent,
  ConversationItemCreateEvent,
  ResponseAudioDeltaEvent,
  ResponseTextDeltaEvent,
  ResponseDoneEvent,
} from './types';
