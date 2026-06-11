/**
 * 3-5 模拟面试及职位推送组
 * 本文件统一导出岗位推荐、文本面试与语音面试模块的公共能力。
 */

export { extractResumeFeatures, extractResumeFeaturesWithLlm, buildResumePlainText } from './featureExtractor';
export { recommendJobs, recommendJobsWithLlm, matchJob } from './jobMatcher';
export { JOB_DATABASE } from './jobDatabase';
export {
  INTERVIEW_DIMENSIONS,
  generateInterviewQuestions,
  fallbackQuestions,
  evaluateInterviewAnswer,
  evaluateInterviewSession,
  mergeEvaluations
} from './interviewService';
export { callInterviewLlmForJson } from './llmClient';
export {
  createInterviewOrchestrator,
  type InterviewOrchestratorLike,
  type VoiceInterviewProvider,
} from './orchestratorFactory';
export {
  createVoiceRecognizer,
  getVoiceInterviewCapability,
  speakInterviewText,
  stopInterviewSpeech
} from './voiceInterview';
