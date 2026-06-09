import type { Template } from "../types/template";
export interface PersonalInfo {
  name: string;
  gender: string;
  phone: string;
  email: string;
  university: string;
  politicalStatus: string;
  website: string;
  avatar: string;
  major: string;
  applicationPosition: string;
  age: string;
}

export interface Education {
  id: number;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
}

export interface WorkExperience {
  id: number;
  company: string;
  position: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
}

export interface Skill {
  id: number;
  skillName: string;
}

export interface Project {
  id: number;
  projectName: string;
  role: string;
  startDate: string;
  endDate: string;
  // 项目简介
  briefIntroduction: string;
  description: string;
}

export interface Honor {
  id: number;
  honorName: string;
  date: string;
  description: string;
}


export type SectionKey =
  | 'personalInfo'
  | 'education'
  | 'projects'
  | 'workExperience'
  | 'skills'
  | 'honors'
  | 'summary';


export interface ResumeSetting {
  themeColor1: string;  // 主题颜色1（深色）
  themeColor2: string;  // 主题颜色2（浅色）
  fontSize: number;     // 字体大小
  sectionSpacing: number;    // 板块之间的间距
  paragraphSpacing: number; // 段落之间的间距
  currentTemplate: String;  // 当前简历模板ID
  padding_left_right: number;  // 左右边距
  padding_top_bottom: number;  // 上下边距
  dpiScale: number;            // PDF导出DPI (72/100/150/300/400/600)
}

export interface ResumeState {
  personalInfo: PersonalInfo;
  education: Education[];
  workExperience: WorkExperience[];
  skills: Skill[];
  projects: Project[];
  honors: Honor[];
  summary: string;
  sectionOrder: SectionKey[];
  currentId: number;
  isFirstVisit: boolean;
  resumeSetting: ResumeSetting;
  isHistoryMode: boolean;
}

export type ResumeContentSnapshot = Omit<
  ResumeState,
  'currentId' | 'isFirstVisit' | 'resumeSetting' | 'isHistoryMode'
>;

export interface PolishExperienceInput {
  snapshot: ResumeContentSnapshot;
  fieldPath: string;
  originalText: string;
  targetPosition?: string;
}

export interface PolishExperienceResult {
  fieldPath: string;
  originalText: string;
  polishedText: string;
  suggestions: string[];
  optimizationTrace?: TextGradOptimizationTrace;
}

export interface PolishOperation {
  fieldPath: string;
  oldValue: string;
  newValue: string;
}

export interface ResumeEvaluationScores {
  completeness: number;
  professionalism: number;
  readability: number;
  jobMatch: number;
  total: number;
}

export interface ResumeSuggestion {
  fieldPath?: string;
  itemId?: number | string;
  problem: string;
  advice: string;
}

export interface ResumeEvaluation {
  scores: ResumeEvaluationScores;
  comments: string[];
  suggestions: ResumeSuggestion[];
}

export type StructureAdvicePriority = 'high' | 'medium' | 'low';

export interface ResumeStructureAdvice {
  title: string;
  problem: string;
  advice: string;
  priority: StructureAdvicePriority;
  relatedSection?: SectionKey | 'overall';
}

export interface ResumeStructureAnalysis {
  targetPosition: string;
  structureScore: number;
  overallJudgement: string;
  sectionOrderSuggestions: ResumeStructureAdvice[];
  experienceSelectionSuggestions: ResumeStructureAdvice[];
  missingContentSuggestions: ResumeStructureAdvice[];
  riskWarnings: string[];
}

export type BatchPolishMode = 'fast' | 'deep';

export interface PolishSafetySummary {
  allowedFieldCount: number;
  returnedOperationCount: number;
  acceptedOperationCount: number;
  blockedOperationCount: number;
  appliedFieldPaths: string[];
  blockedReasons: string[];
}

export interface BatchPolishOptions {
  mode?: BatchPolishMode;
  targetPosition?: string;
  structureAdvice?: ResumeStructureAnalysis | null;
}

export interface AITaskOptions {
  targetPosition?: string;
}

export interface BatchPolishResult {
  operations: PolishOperation[];
  summary: string;
  suggestions: ResumeSuggestion[];
  mode?: BatchPolishMode;
  usedStructureAdvice?: boolean;
  safety?: PolishSafetySummary;
  optimizationTrace?: TextGradOptimizationTrace;
}

export interface TextGradOptimizationTrace {
  objective: string;
  draft: string;
  textualGradient: string;
  optimized: string;
  iterations: number;
}
