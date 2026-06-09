import { sendToQwenAIDialogue, type AIRequestOptions } from '../api/qwenAPI';
import { promptOptimizationExamples } from '../data/promptOptimizationExamples';
import { defaultPromptSet } from './promptSets';
import type { DialogueHistory } from '../types/aiDialogue';
import type {
  PromptEvaluationResult,
  PromptEvaluationScores,
  PromptOptimizationExample,
  PromptOptimizationTrace,
  PromptSet
} from '../types/promptOptimization';

type JsonRecord = Record<string, unknown>;

type PromptOptimizationOptions = {
  maxExamples?: number;
  evaluateCandidate?: boolean;
  onProgress?: (message: string) => void;
};

const promptJsonRequestOptions: AIRequestOptions = {
  response_format: { type: 'json_object' },
  temperature: 0
};

const parseJsonObject = <T>(text: string): T | null => {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as T;
  } catch (error) {
    console.error('解析提示词优化 JSON 失败:', error);
    return null;
  }
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
};

const clampScore = (value: unknown): number => {
  const score = Number(value);
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const completePromptDialogue = (
  messages: DialogueHistory,
  requestOptions: AIRequestOptions = promptJsonRequestOptions
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let latestText = '';
    let settled = false;
    sendToQwenAIDialogue(messages, (text, isComplete, error) => {
      if (settled) return;
      if (error) {
        settled = true;
        reject(new Error(error));
        return;
      }
      latestText = text;
      if (isComplete) {
        settled = true;
        resolve(latestText);
      }
    }, requestOptions).catch(reject);
  });
};

const averageScores = (results: PromptEvaluationResult[]): PromptEvaluationScores => {
  const empty: PromptEvaluationScores = {
    star: 0,
    truthfulness: 0,
    professionalism: 0,
    jobMatch: 0,
    jsonCompliance: 0,
    fieldSafety: 0,
    total: 0
  };

  if (results.length === 0) return empty;

  const summed = results.reduce((acc, item) => ({
    star: acc.star + item.scores.star,
    truthfulness: acc.truthfulness + item.scores.truthfulness,
    professionalism: acc.professionalism + item.scores.professionalism,
    jobMatch: acc.jobMatch + item.scores.jobMatch,
    jsonCompliance: acc.jsonCompliance + item.scores.jsonCompliance,
    fieldSafety: acc.fieldSafety + item.scores.fieldSafety,
    total: acc.total + item.scores.total
  }), empty);

  return {
    star: Math.round(summed.star / results.length),
    truthfulness: Math.round(summed.truthfulness / results.length),
    professionalism: Math.round(summed.professionalism / results.length),
    jobMatch: Math.round(summed.jobMatch / results.length),
    jsonCompliance: Math.round(summed.jsonCompliance / results.length),
    fieldSafety: Math.round(summed.fieldSafety / results.length),
    total: Math.round(summed.total / results.length)
  };
};

const buildForwardPayload = (promptSet: PromptSet, example: PromptOptimizationExample): JsonRecord => {
  if (example.task === 'single-star-polish') {
    return {
      task: 'forward-single-star-polish',
      objective: promptSet.tasks.singleStarPolish.objective?.join('\n'),
      schema: {
        fieldPath: 'string',
        originalText: 'string',
        polishedText: 'string',
        suggestions: ['string']
      },
      requirements: promptSet.tasks.singleStarPolish.requirements,
      input: example.input
    };
  }

  if (example.task === 'batch-polish-resume') {
    return {
      task: 'forward-batch-polish-resume',
      objective: promptSet.tasks.batchPolishResume.objective?.join('\n'),
      schema: {
        operations: [{ fieldPath: 'string', oldValue: 'string', newValue: 'string' }],
        summary: 'string',
        suggestions: [{ fieldPath: 'string | optional', problem: 'string', advice: 'string' }]
      },
      requirements: promptSet.tasks.batchPolishResume.requirements,
      input: { snapshot: example.input.snapshot }
    };
  }

  return {
    task: 'forward-evaluate-resume',
    schema: {
      scores: {
        completeness: 'number 0-100',
        professionalism: 'number 0-100',
        readability: 'number 0-100',
        jobMatch: 'number 0-100',
        total: 'number 0-100'
      },
      comments: ['string'],
      suggestions: [{ fieldPath: 'string | optional', problem: 'string', advice: 'string' }]
    },
    requirements: promptSet.tasks.evaluateResume.requirements,
    input: { snapshot: example.input.snapshot }
  };
};

const runPromptJsonTask = async (
  promptSet: PromptSet,
  payload: JsonRecord
): Promise<{ rawText: string; parsed: JsonRecord | null }> => {
  const rawText = await completePromptDialogue([
    { role: 'system', content: promptSet.systemPrompt },
    { role: 'user', content: JSON.stringify(payload) }
  ]);
  return { rawText, parsed: parseJsonObject<JsonRecord>(rawText) };
};

const runForwardExample = async (
  promptSet: PromptSet,
  example: PromptOptimizationExample
): Promise<JsonRecord | string> => {
  const forward = await runPromptJsonTask(promptSet, buildForwardPayload(promptSet, example));
  return forward.parsed || forward.rawText;
};

const normalizeEvaluation = (
  example: PromptOptimizationExample,
  parsed: JsonRecord | null
): PromptEvaluationResult => {
  const scoresRecord = (parsed?.scores || {}) as JsonRecord;
  const scores: PromptEvaluationScores = {
    star: clampScore(scoresRecord.star),
    truthfulness: clampScore(scoresRecord.truthfulness),
    professionalism: clampScore(scoresRecord.professionalism),
    jobMatch: clampScore(scoresRecord.jobMatch),
    jsonCompliance: clampScore(scoresRecord.jsonCompliance),
    fieldSafety: clampScore(scoresRecord.fieldSafety),
    total: clampScore(scoresRecord.total)
  };

  if (!scores.total) {
    scores.total = Math.round(
      (scores.star + scores.truthfulness + scores.professionalism + scores.jobMatch + scores.jsonCompliance + scores.fieldSafety) / 6
    );
  }

  return {
    exampleId: example.id,
    task: example.task,
    scores,
    strengths: asStringArray(parsed?.strengths),
    weaknesses: asStringArray(parsed?.weaknesses),
    promptProblems: asStringArray(parsed?.promptProblems)
  };
};

const evaluateExampleOutput = async (
  promptSet: PromptSet,
  example: PromptOptimizationExample,
  output: JsonRecord | string
): Promise<PromptEvaluationResult> => {
  const evaluation = await runPromptJsonTask(promptSet, {
    task: 'prompt-optimization-evaluate-output',
    schema: {
      scores: {
        star: 'number 0-100',
        truthfulness: 'number 0-100',
        professionalism: 'number 0-100',
        jobMatch: 'number 0-100',
        jsonCompliance: 'number 0-100',
        fieldSafety: 'number 0-100',
        total: 'number 0-100'
      },
      strengths: ['string'],
      weaknesses: ['string'],
      promptProblems: ['string']
    },
    requirements: promptSet.tasks.promptOptimization.evaluatorRequirements,
    example,
    output
  });

  return normalizeEvaluation(example, evaluation.parsed);
};

export const evaluatePromptSet = async (
  promptSet: PromptSet = defaultPromptSet,
  examples: PromptOptimizationExample[] = promptOptimizationExamples,
  options: Pick<PromptOptimizationOptions, 'maxExamples' | 'onProgress'> = {}
): Promise<PromptEvaluationResult[]> => {
  const selectedExamples = examples.slice(0, options.maxExamples || examples.length);
  const results: PromptEvaluationResult[] = [];

  for (const example of selectedExamples) {
    options.onProgress?.(`正在评估样例：${example.title}`);
    const output = await runForwardExample(promptSet, example);
    results.push(await evaluateExampleOutput(promptSet, example, output));
  }

  return results;
};

const buildPromptTextualGradient = async (
  promptSet: PromptSet,
  evaluationResults: PromptEvaluationResult[]
): Promise<string> => {
  const gradient = await runPromptJsonTask(promptSet, {
    task: 'backward-prompt-textual-gradient',
    schema: {
      critique: 'string',
      promptWeaknesses: ['string'],
      updateDirections: ['string'],
      constraintsToKeep: ['string']
    },
    requirements: promptSet.tasks.promptOptimization.gradientRequirements,
    promptSet,
    evaluationResults
  });

  if (!gradient.parsed) return gradient.rawText;
  return [
    `总体批评：${String(gradient.parsed.critique || '').trim()}`,
    `提示词问题：${asStringArray(gradient.parsed.promptWeaknesses).join('；')}`,
    `更新方向：${asStringArray(gradient.parsed.updateDirections).join('；')}`,
    `必须保留：${asStringArray(gradient.parsed.constraintsToKeep).join('；')}`
  ].filter(item => !item.endsWith('：')).join('\n');
};

const mergeCandidatePromptSet = (
  oldPromptSet: PromptSet,
  parsed: JsonRecord | null
): PromptSet => {
  const candidate = (parsed?.promptSet || parsed) as Partial<PromptSet> | null;
  if (!candidate || typeof candidate !== 'object') return oldPromptSet;

  return {
    ...oldPromptSet,
    ...candidate,
    id: String(candidate.id || `${oldPromptSet.id}-candidate`),
    version: String(candidate.version || `${oldPromptSet.version}-candidate`),
    name: String(candidate.name || `${oldPromptSet.name} Candidate`),
    description: String(candidate.description || oldPromptSet.description),
    systemPrompt: String(candidate.systemPrompt || oldPromptSet.systemPrompt),
    contentGradientRequirements: Array.isArray(candidate.contentGradientRequirements)
      ? candidate.contentGradientRequirements.map(String)
      : oldPromptSet.contentGradientRequirements,
    contentOptimizerRequirements: Array.isArray(candidate.contentOptimizerRequirements)
      ? candidate.contentOptimizerRequirements.map(String)
      : oldPromptSet.contentOptimizerRequirements,
    tasks: {
      singleStarPolish: {
        ...oldPromptSet.tasks.singleStarPolish,
        ...candidate.tasks?.singleStarPolish
      },
      batchPolishResume: {
        ...oldPromptSet.tasks.batchPolishResume,
        ...candidate.tasks?.batchPolishResume
      },
      evaluateResume: {
        ...oldPromptSet.tasks.evaluateResume,
        ...candidate.tasks?.evaluateResume
      },
      promptOptimization: {
        ...oldPromptSet.tasks.promptOptimization,
        ...candidate.tasks?.promptOptimization
      }
    }
  };
};

const optimizePromptVariable = async (
  promptSet: PromptSet,
  textualGradient: string
): Promise<PromptSet> => {
  const optimized = await runPromptJsonTask(promptSet, {
    task: 'optimizer-update-prompt-set',
    schema: {
      promptSet: 'PromptSet JSON with same fields as input promptSet'
    },
    requirements: promptSet.tasks.promptOptimization.optimizerRequirements,
    oldPromptSet: promptSet,
    textualGradient
  });

  return mergeCandidatePromptSet(promptSet, optimized.parsed);
};

export const optimizePromptSet = async (
  promptSet: PromptSet = defaultPromptSet,
  examples: PromptOptimizationExample[] = promptOptimizationExamples,
  options: PromptOptimizationOptions = {}
): Promise<PromptOptimizationTrace> => {
  options.onProgress?.('开始评估当前 PromptSet');
  const beforeResults = await evaluatePromptSet(promptSet, examples, options);
  const scoreBefore = averageScores(beforeResults);

  options.onProgress?.('生成 PromptSet 的 TextGrad 文本梯度');
  const textualGradient = await buildPromptTextualGradient(promptSet, beforeResults);

  options.onProgress?.('根据文本梯度生成候选 PromptSet');
  const newPromptSet = await optimizePromptVariable(promptSet, textualGradient);

  let scoreAfter: PromptEvaluationScores | undefined;
  if (options.evaluateCandidate) {
    options.onProgress?.('评估候选 PromptSet');
    const afterResults = await evaluatePromptSet(newPromptSet, examples, options);
    scoreAfter = averageScores(afterResults);
  }

  return {
    oldPromptSet: promptSet,
    textualGradient,
    newPromptSet,
    scoreBefore,
    scoreAfter,
    examples: beforeResults
  };
};
