import { BasicInterviewOrchestrator } from './basicVoice/basicInterviewOrchestrator';
import type { InterviewContext } from './realtime';
import type { OrchestratorEventMap } from './realtime';

export type VoiceInterviewProvider = 'basic';

export interface InterviewOrchestratorLike {
  start(): Promise<void>;
  startMic(): Promise<void>;
  stopMic(): Promise<void>;
  stop(): Promise<void>;
  on<K extends keyof OrchestratorEventMap>(
    event: K,
    listener: (payload: OrchestratorEventMap[K]) => void,
  ): () => void;
}

export function createInterviewOrchestrator(
  _provider: VoiceInterviewProvider,
  context: InterviewContext,
): InterviewOrchestratorLike {
  return new BasicInterviewOrchestrator(context);
}
