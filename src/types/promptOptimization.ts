/**
 * 3-4 大模型润色组提示词优化类型定义。
 *
 * 本文件描述 PromptSet、优化样例、评分结果和优化轨迹，用来支撑“提示词也是可优化变量”
 * 的 TextGrad 方案。
 */
import type { ResumeContentSnapshot } from './resume';

export type PromptOptimizationTask =
  | 'single-star-polish'
  | 'batch-polish-resume'
  | 'evaluate-resume';

export interface PromptTaskConfig {
  objective?: string[];
  requirements: string[];
}

export interface PromptOptimizationConfig {
  evaluatorRequirements: string[];
  gradientRequirements: string[];
  optimizerRequirements: string[];
}

export interface PromptSet {
  id: string;
  version: string;
  name: string;
  description: string;
  systemPrompt: string;
  contentGradientRequirements: string[];
  contentOptimizerRequirements: string[];
  tasks: {
    singleStarPolish: PromptTaskConfig;
    batchPolishResume: PromptTaskConfig;
    evaluateResume: PromptTaskConfig;
    promptOptimization: PromptOptimizationConfig;
  };
}

export interface PromptOptimizationExample {
  id: string;
  title: string;
  task: PromptOptimizationTask;
  input: {
    snapshot: ResumeContentSnapshot;
    fieldPath?: string;
    originalText?: string;
    targetPosition?: string;
  };
  evaluationFocus: string[];
  forbidden: string[];
}

export interface PromptEvaluationScores {
  star: number;
  truthfulness: number;
  professionalism: number;
  jobMatch: number;
  jsonCompliance: number;
  fieldSafety: number;
  total: number;
}

export interface PromptEvaluationResult {
  exampleId: string;
  task: PromptOptimizationTask;
  scores: PromptEvaluationScores;
  strengths: string[];
  weaknesses: string[];
  promptProblems: string[];
}

export interface PromptOptimizationTrace {
  oldPromptSet: PromptSet;
  textualGradient: string;
  newPromptSet: PromptSet;
  scoreBefore: PromptEvaluationScores;
  scoreAfter?: PromptEvaluationScores;
  examples: PromptEvaluationResult[];
}
