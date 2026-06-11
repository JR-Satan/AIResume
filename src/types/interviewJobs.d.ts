/**
 * 3-5 模拟面试及职位推送组
 * 本文件定义岗位推荐、面试题、评分结果和语音识别相关的公共类型。
 */

import type { ResumeContentSnapshot } from './resume';

export type InterviewDimension =
  | '专业能力'
  | '项目表达'
  | '逻辑结构'
  | '沟通清晰'
  | '岗位动机';

export interface ResumeFeatures {
  targetPosition: string;
  educationLevel: string;
  majors: string[];
  skills: string[];
  projectKeywords: string[];
  workKeywords: string[];
  experienceYears: number;
  honors: string[];
  rawText: string;
}

export interface JobProfile {
  id: string;
  title: string;
  industry: string;
  level: string;
  keywords: string[];
  responsibilities: string[];
  requirements: string[];
}

export interface JobRecommendation {
  job: JobProfile;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  reason: string;
}

export type InterviewType = 'technical' | 'behavioral' | 'hr' | 'business';
export type InterviewQuestionSource = 'resume' | 'jd' | 'hybrid' | 'preset';

export interface InterviewQuestion {
  id: number;
  question: string;
  dimension: InterviewDimension;
  referencePoints: string[];
  type?: InterviewType;
  source?: InterviewQuestionSource;
}

export interface InterviewEvaluation {
  scores: Record<InterviewDimension, number>;
  totalScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  questionAnalyses?: InterviewQuestionAnalysis[];
  suggestedScript?: string;
}

export interface InterviewQuestionAnalysis {
  questionId: number;
  score: number;
  analysis: string;
  strengths: string[];
  improvements: string[];
}

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

export interface InterviewSessionInput {
  snapshot: ResumeContentSnapshot;
  job: JobProfile;
  questionCount?: number;
}

export interface VoiceInterviewCapability {
  speechSynthesis: boolean;
  speechRecognition: boolean;
}

export interface VoiceRecognitionPayload {
  transcript: string;
  isFinal: boolean;
}

export interface VoiceRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (payload: VoiceRecognitionPayload) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}
