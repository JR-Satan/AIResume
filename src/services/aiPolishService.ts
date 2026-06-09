import { sendToQwenAIDialogue, type AIRequestOptions } from '../api/qwenAPI';
import { getActivePromptSet } from './promptSets';
import type { DialogueHistory } from '../types/aiDialogue';
import type {
  AITaskOptions,
  BatchPolishMode,
  BatchPolishOptions,
  BatchPolishResult,
  PolishSafetySummary,
  PolishExperienceInput,
  PolishExperienceResult,
  PolishOperation,
  ResumeContentSnapshot,
  ResumeEvaluation,
  ResumeEvaluationScores,
  ResumeStructureAdvice,
  ResumeStructureAnalysis,
  ResumeSuggestion,
  TextGradOptimizationTrace
} from '../types/resume';

type StreamHandler = (text: string, isComplete: boolean) => void;
type JsonRecord = Record<string, unknown>;

const allowedPolishFieldPathPattern =
  /^(workExperience\[\d+\]\.description|projects\[\d+\]\.(briefIntroduction|description)|honors\[\d+\]\.description|summary)$/;

const isAllowedPolishFieldPath = (fieldPath: string): boolean =>
  allowedPolishFieldPathPattern.test(fieldPath);

const allowedSuggestionFieldPathPattern =
  /^(personalInfo\.(name|gender|phone|email|university|politicalStatus|avatar|major|applicationPosition|age)|education\[\d+\]\.(school|degree|major|startDate|endDate)|workExperience\[\d+\]\.(company|position|startDate|endDate|description)|projects\[\d+\]\.(projectName|role|startDate|endDate|briefIntroduction|description)|skills\[\d+\]\.skillName|honors\[\d+\]\.(honorName|date|description)|summary)$/;

const isAllowedSuggestionFieldPath = (fieldPath: string): boolean =>
  allowedSuggestionFieldPathPattern.test(fieldPath);

const parseFieldPath = (fieldPath: string): Array<string | number> => {
  const parts: Array<string | number> = [];
  const pattern = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fieldPath)) !== null) {
    parts.push(match[2] === undefined ? match[1] : Number(match[2]));
  }
  return parts;
};

const getValueByFieldPath = (root: unknown, fieldPath: string): unknown => {
  return parseFieldPath(fieldPath).reduce((target: unknown, key) => {
    if (target === null || target === undefined || typeof target !== 'object') return undefined;
    return (target as Record<string, unknown>)[key as keyof typeof target];
  }, root);
};

type TextGradRunConfig<T> = {
  objective: string;
  task: string;
  schema: JsonRecord;
  requirements: string[];
  input: JsonRecord;
  normalize: (parsed: JsonRecord | null, rawText: string) => T;
  requestOptions?: AIRequestOptions;
};

type PolishableTarget = {
  fieldPath: string;
  label: string;
  text: string;
};

type OperationNormalizationResult = {
  operations: PolishOperation[];
  droppedReasons: string[];
  returnedOperationCount: number;
};

const clampScore = (value: unknown): number => {
  const rawValue = typeof value === 'string'
    ? value.match(/\d+(?:\.\d+)?/)?.[0]
    : value;
  const score = Number(rawValue);
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const parseJsonObject = <T>(text: string): T | null => {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const arrayStart = withoutFence.indexOf('[');
    const arrayEnd = withoutFence.lastIndexOf(']');
    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) return null;
    try {
      return { adviceItems: JSON.parse(withoutFence.slice(arrayStart, arrayEnd + 1)) } as T;
    } catch (error) {
      console.error('解析 AI JSON 数组失败:', error);
      return null;
    }
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as T;
  } catch (error) {
    console.error('解析 AI JSON 失败:', error);
    return null;
  }
};

const modelErrorTextPattern =
  /(抱歉|无法(?:完成|处理|生成|解析)|不能(?:完成|处理|生成)|请求失败|调用失败|API\s*Key|unauthorized|invalid|error)/i;

const containsModelErrorText = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return modelErrorTextPattern.test(value);
  if (Array.isArray(value)) return value.some(containsModelErrorText);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsModelErrorText);
  }
  return false;
};

const validateParsedResult = (parsed: JsonRecord | null, rawText: string, taskName: string): JsonRecord => {
  if (!parsed) {
    throw new Error(`${taskName} 未返回合法 JSON`);
  }
  if (containsModelErrorText(rawText) && !Object.keys(parsed).length) {
    throw new Error(`${taskName} 返回了模型错误文本`);
  }
  return parsed;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
};

const normalizeSuggestion = (value: unknown): ResumeSuggestion | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const problem = String(record.problem ?? '').trim();
  const advice = String(record.advice ?? '').trim();
  const fieldPath = String(record.fieldPath ?? '').trim();
  const itemId = record.itemId;
  if (!problem || !advice) return null;
  return {
    fieldPath: fieldPath && isAllowedSuggestionFieldPath(fieldPath) ? fieldPath : undefined,
    itemId: typeof itemId === 'number' || typeof itemId === 'string' ? itemId : undefined,
    problem,
    advice
  };
};

const normalizeSuggestions = (value: unknown): ResumeSuggestion[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeSuggestion)
    .filter((item): item is ResumeSuggestion => Boolean(item));
};

const structureSectionSet = new Set([
  'overall',
  'personalInfo',
  'education',
  'projects',
  'workExperience',
  'skills',
  'honors',
  'summary'
]);

const normalizePriority = (value: unknown): ResumeStructureAdvice['priority'] => {
  const priority = String(value || '').toLowerCase();
  if (priority === 'high' || priority === 'low') return priority;
  return 'medium';
};

const normalizeStructureAdvice = (value: unknown): ResumeStructureAdvice | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = String(record.title || '').trim();
  const problem = String(record.problem || '').trim();
  const advice = String(record.advice || '').trim();
  const relatedSection = String(record.relatedSection || 'overall').trim();
  if (!title || !problem || !advice) return null;
  return {
    title,
    problem,
    advice,
    priority: normalizePriority(record.priority),
    relatedSection: structureSectionSet.has(relatedSection)
      ? relatedSection as ResumeStructureAdvice['relatedSection']
      : 'overall'
  };
};

const normalizeStructureAdviceList = (value: unknown): ResumeStructureAdvice[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeStructureAdvice)
    .filter((item): item is ResumeStructureAdvice => Boolean(item))
    .slice(0, 4);
};

type StructureAdviceCategory = 'order' | 'selection' | 'missing' | 'risk';

type FlatStructureAdvice = ResumeStructureAdvice & {
  category: StructureAdviceCategory;
};

const normalizeStructureAdviceCategory = (value: unknown): StructureAdviceCategory => {
  const category = String(value || '').toLowerCase();
  if (category.includes('selection') || category.includes('select') || category.includes('取舍')) return 'selection';
  if (category.includes('经历') || category.includes('项目') || category.includes('工作')) return 'selection';
  if (category.includes('missing') || category.includes('content') || category.includes('补充')) return 'missing';
  if (category.includes('risk') || category.includes('风险')) return 'risk';
  if (category.includes('模块') || category.includes('顺序') || category.includes('结构')) return 'order';
  return 'order';
};

const normalizeFlatStructureAdvice = (value: unknown): FlatStructureAdvice | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const category = normalizeStructureAdviceCategory(record.category || record.type || record['类型'] || record['类别']);
  const title = String(record.title || record.name || record['标题'] || record['主题'] || record['类型'] || '').trim();
  const problem = String(record.problem || record.reason || record.issue || record['问题'] || record['原因'] || title).trim();
  const adviceText = String(
    record.advice ||
    record.suggestion ||
    record.action ||
    record.content ||
    record['建议'] ||
    record['优化建议'] ||
    record['建议内容'] ||
    record['内容'] ||
    ''
  ).trim();
  const relatedSection = String(
    record.relatedSection ||
    record.section ||
    record.module ||
    record['模块'] ||
    record['部分'] ||
    'overall'
  ).trim();
  if (!title || !adviceText) return null;
  return {
    title,
    problem,
    advice: adviceText,
    priority: normalizePriority(record.priority),
    relatedSection: structureSectionSet.has(relatedSection)
      ? relatedSection as ResumeStructureAdvice['relatedSection']
      : 'overall',
    category
  };
};

const normalizeFlatStructureAdviceList = (value: unknown): FlatStructureAdvice[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeFlatStructureAdvice)
    .filter((item): item is FlatStructureAdvice => Boolean(item))
    .slice(0, 8);
};

const extractFlatStructureAdviceList = (parsed: JsonRecord): FlatStructureAdvice[] => {
  const directValues = [
    parsed.adviceItems,
    parsed.suggestions,
    parsed.advice,
    parsed.items,
    parsed.result,
    parsed['建议'],
    parsed['建议列表'],
    parsed['结构建议']
  ];
  for (const value of directValues) {
    const items = normalizeFlatStructureAdviceList(value);
    if (items.length > 0) return items;
  }
  const fromOldSchema = [
    ...normalizeStructureAdviceList(parsed.sectionOrderSuggestions).map(item => ({ ...item, category: 'order' as const })),
    ...normalizeStructureAdviceList(parsed.experienceSelectionSuggestions).map(item => ({ ...item, category: 'selection' as const })),
    ...normalizeStructureAdviceList(parsed.missingContentSuggestions).map(item => ({ ...item, category: 'missing' as const })),
    ...asStringArray(parsed.riskWarnings).map((text): FlatStructureAdvice => ({
      title: '风险提醒',
      problem: text,
      advice: text,
      priority: 'medium',
      relatedSection: 'overall',
      category: 'risk'
    }))
  ];
  return fromOldSchema.slice(0, 8);
};

const normalizeFlatStructureAnalysis = (
  parsed: JsonRecord | null,
  snapshot: ResumeContentSnapshot,
  targetPositionOverride?: string
): ResumeStructureAnalysis | null => {
  if (!parsed || containsModelErrorText(parsed)) return null;
  const adviceItems = extractFlatStructureAdviceList(parsed);
  if (adviceItems.length === 0) return null;
  const targetPosition = String(
    parsed.targetPosition || resolveTargetPosition(snapshot, targetPositionOverride)
  ).trim();
  const pick = (category: StructureAdviceCategory) =>
    adviceItems
      .filter(item => item.category === category)
      .map(({ category: _category, ...item }) => item)
      .slice(0, 2);
  const riskWarnings = adviceItems
    .filter(item => item.category === 'risk')
    .map(item => item.advice || item.problem || item.title)
    .filter(Boolean)
    .slice(0, 3);
  return {
    targetPosition,
    structureScore: clampScore(parsed.structureScore),
    overallJudgement: String(parsed.overallJudgement || '已生成岗位导向的结构建议。').trim(),
    sectionOrderSuggestions: pick('order'),
    experienceSelectionSuggestions: pick('selection'),
    missingContentSuggestions: pick('missing'),
    riskWarnings
  };
};

const collectTextFragments = (value: unknown, output: string[] = []): string[] => {
  if (value === null || value === undefined) return output;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectTextFragments(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (key === 'targetPosition' || key === 'structureScore') return;
      collectTextFragments(item, output);
    });
  }
  return output;
};

const splitAiAdviceText = (text: string): string[] => {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/[{}[\]",]/g, '\n');
  return withoutFence
    .split(/\r?\n|[。；;]/)
    .map(item => item.replace(/^\s*[-*•\d.、)）\]]+\s*/, '').trim())
    .filter(item =>
      item.length >= 8 &&
      !/^targetPosition|^structureScore|^overallJudgement|^adviceItems/i.test(item) &&
      !/^(order|selection|missing|risk|high|medium|low)$/i.test(item)
    )
    .slice(0, 8);
};

const inferCategoryFromText = (text: string, index: number): StructureAdviceCategory => {
  if (/风险|不匹配|缺少|薄弱|不足/.test(text)) return index >= 3 ? 'risk' : 'missing';
  if (/补充|增加|量化|结果|指标|关键词/.test(text)) return 'missing';
  if (/保留|弱化|突出|经历|项目|工作/.test(text)) return 'selection';
  if (/顺序|结构|模块|前置|后置|调整/.test(text)) return 'order';
  return (['order', 'selection', 'missing', 'risk'] as StructureAdviceCategory[])[Math.min(index, 3)] || 'order';
};

const normalizeStructureAnalysisFromAiText = (
  rawText: string,
  parsed: JsonRecord | null,
  snapshot: ResumeContentSnapshot,
  targetPositionOverride?: string
): ResumeStructureAnalysis | null => {
  if (containsModelErrorText(rawText)) return null;
  const targetPosition = resolveTargetPosition(snapshot, targetPositionOverride);
  const fragments = [
    ...collectTextFragments(parsed),
    ...splitAiAdviceText(rawText)
  ]
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter((item, index, array) => item && array.indexOf(item) === index)
    .slice(0, 7);
  if (fragments.length === 0) return null;

  const overallJudgement = fragments[0].length > 90
    ? `${fragments[0].slice(0, 90)}...`
    : fragments[0];
  const adviceItems = fragments.slice(1).length > 0 ? fragments.slice(1) : fragments;
  const flatItems = adviceItems.map((text, index): FlatStructureAdvice => ({
    category: inferCategoryFromText(text, index),
    relatedSection: /技能|关键词/.test(text)
      ? 'skills'
      : /项目/.test(text)
        ? 'projects'
        : /工作|实习/.test(text)
          ? 'workExperience'
          : 'overall',
    priority: index < 2 ? 'high' : 'medium',
    title: index === 0 ? '结构调整' : index === 1 ? '经历取舍' : index === 2 ? '内容补充' : '风险提醒',
    problem: text.length > 46 ? `${text.slice(0, 46)}...` : text,
    advice: text.length > 86 ? `${text.slice(0, 86)}...` : text
  }));
  const pick = (category: StructureAdviceCategory) =>
    flatItems
      .filter(item => item.category === category)
      .map(({ category: _category, ...item }) => item)
      .slice(0, 2);
  const riskWarnings = flatItems
    .filter(item => item.category === 'risk')
    .map(item => item.advice)
    .slice(0, 3);

  return {
    targetPosition,
    structureScore: parsed ? clampScore(parsed.structureScore || parsed.score || parsed['评分']) || 75 : 75,
    overallJudgement,
    sectionOrderSuggestions: pick('order'),
    experienceSelectionSuggestions: pick('selection'),
    missingContentSuggestions: pick('missing'),
    riskWarnings
  };
};

const normalizeStructureAnalysis = (
  parsed: JsonRecord | null,
  snapshot: ResumeContentSnapshot,
  targetPositionOverride?: string
): ResumeStructureAnalysis | null => {
  if (!parsed || containsModelErrorText(parsed)) return null;
  const targetPosition = String(
    parsed.targetPosition || resolveTargetPosition(snapshot, targetPositionOverride) || '目标岗位未填写'
  ).trim();
  const result: ResumeStructureAnalysis = {
    targetPosition,
    structureScore: clampScore(parsed?.structureScore),
    overallJudgement: String(parsed?.overallJudgement || '暂未生成整体结构判断。').trim(),
    sectionOrderSuggestions: normalizeStructureAdviceList(parsed?.sectionOrderSuggestions),
    experienceSelectionSuggestions: normalizeStructureAdviceList(parsed?.experienceSelectionSuggestions),
    missingContentSuggestions: normalizeStructureAdviceList(parsed?.missingContentSuggestions),
    riskWarnings: asStringArray(parsed?.riskWarnings).slice(0, 4)
  };
  const hasAdvice = [
    result.sectionOrderSuggestions,
    result.experienceSelectionSuggestions,
    result.missingContentSuggestions,
    result.riskWarnings
  ].some(items => items.length > 0);
  if (!result.structureScore && !hasAdvice && result.overallJudgement === '暂未生成整体结构判断。') {
    return null;
  }
  return result;
};

const normalizeEvaluationResult = (parsed: JsonRecord | null): ResumeEvaluation | null => {
  const scoresRecord = asJsonRecord(parsed?.scores);
  if (!scoresRecord) return null;

  const scores: ResumeEvaluationScores = {
    completeness: clampScore(scoresRecord.completeness),
    professionalism: clampScore(scoresRecord.professionalism),
    readability: clampScore(scoresRecord.readability),
    jobMatch: clampScore(scoresRecord.jobMatch),
    total: clampScore(scoresRecord.total)
  };
  const dimensionScores = [
    scores.completeness,
    scores.professionalism,
    scores.readability,
    scores.jobMatch
  ];

  if (!scores.total && dimensionScores.some(score => score > 0)) {
    scores.total = Math.round(
      dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length
    );
  }

  const comments = asStringArray(parsed?.comments);
  const suggestions = normalizeSuggestions(parsed?.suggestions);
  const hasAnyScore = scores.total > 0 || dimensionScores.some(score => score > 0);
  const hasAnyFeedback = comments.length > 0 || suggestions.length > 0;
  if (!hasAnyScore && !hasAnyFeedback) return null;

  return {
    scores,
    comments,
    suggestions
  };
};

const normalizeOperationWithReason = (
  value: unknown,
  snapshot?: ResumeContentSnapshot
): { operation: PolishOperation | null; reason: string } => {
  if (!value || typeof value !== 'object') {
    return { operation: null, reason: 'operation 不是对象' };
  }
  const record = value as Record<string, unknown>;
  const fieldPath = String(record.fieldPath ?? '').trim();
  if (!isAllowedPolishFieldPath(fieldPath)) {
    return { operation: null, reason: `字段路径不在白名单内：${fieldPath || '(空)'}` };
  }
  const currentValue = snapshot ? getValueByFieldPath(snapshot, fieldPath) : undefined;
  const oldValue = typeof currentValue === 'string'
    ? currentValue
    : String(record.oldValue ?? '');
  const newValue = String(record.newValue ?? '').trim();
  if (!fieldPath) return { operation: null, reason: '字段路径为空' };
  if (!newValue) return { operation: null, reason: `newValue 为空：${fieldPath}` };
  if (containsModelErrorText(newValue)) return { operation: null, reason: `newValue 疑似模型错误文本：${fieldPath}` };
  if (oldValue === newValue) return { operation: null, reason: `newValue 与原文相同：${fieldPath}` };
  return {
    operation: { fieldPath, oldValue, newValue },
    reason: ''
  };
};

const formatTextGradient = (parsed: JsonRecord | null, rawText: string): string => {
  if (!parsed) return rawText.trim();
  const sections = [
    ['总体批评', parsed.critique],
    ['需要保留', parsed.keep],
    ['需要修改', parsed.improve],
    ['事实风险', parsed.risks]
  ];

  return sections
    .map(([title, value]) => {
      if (Array.isArray(value)) {
        const items = value.map(item => String(item).trim()).filter(Boolean);
        return items.length ? `${title}：${items.join('；')}` : '';
      }
      const text = String(value || '').trim();
      return text ? `${title}：${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
};

const jsonRequestOptions: AIRequestOptions = {
  response_format: { type: 'json_object' },
  temperature: 0,
  stream: false,
  max_tokens: 2200
};

const batchJsonRequestOptions: AIRequestOptions = {
  ...jsonRequestOptions,
  max_tokens: 5000
};

const fastBatchJsonRequestOptions: AIRequestOptions = {
  ...jsonRequestOptions,
  max_tokens: 3000
};

const evaluationJsonRequestOptions: AIRequestOptions = {
  ...jsonRequestOptions,
  temperature: 0,
  max_tokens: 2200
};

const structureJsonRequestOptions: AIRequestOptions = {
  ...jsonRequestOptions,
  temperature: 0,
  max_tokens: 1200,
  timeoutMs: 35000
};

const limitText = (value: unknown, maxLength = 900): string => {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const stringifyTraceValue = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const asJsonRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const toDialogueError = (error: unknown, fallback = 'AI call failed'): Error => {
  if (error instanceof Error) return error;
  const message = String(error || fallback);
  return new Error(message);
};

const completeDialogueAttempt = (
  messages: DialogueHistory,
  onStream?: StreamHandler,
  requestOptions?: AIRequestOptions,
  emitErrorToStream = true
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let latestText = '';
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      const dialogueError = toDialogueError(error);
      if (emitErrorToStream) {
        onStream?.(dialogueError.message, true);
      }
      reject(dialogueError);
    };

    sendToQwenAIDialogue(messages, (text, isComplete, error) => {
      if (settled) return;
      if (error) {
        fail(error);
        return;
      }
      latestText = text;
      onStream?.(text, isComplete);
      if (isComplete) {
        settled = true;
        resolve(latestText);
      }
    }, requestOptions).catch(fail);
  });
};

const completeDialogue = async (
  messages: DialogueHistory,
  onStream?: StreamHandler,
  requestOptions?: AIRequestOptions
): Promise<string> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await completeDialogueAttempt(
        messages,
        onStream,
        requestOptions,
        attempt === 2
      );
    } catch (error) {
      lastError = toDialogueError(error);
    }
  }

  throw lastError ?? new Error('AI call failed');
};

const runJsonTask = async (
  payload: JsonRecord,
  onStream?: StreamHandler,
  requestOptions: AIRequestOptions = jsonRequestOptions
): Promise<{ rawText: string; parsed: JsonRecord | null }> => {
  const promptSet = getActivePromptSet();
  const rawText = await completeDialogue([
    { role: 'system', content: promptSet.systemPrompt },
    { role: 'user', content: JSON.stringify(payload) }
  ], onStream, requestOptions);

  return {
    rawText,
    parsed: parseJsonObject<JsonRecord>(rawText)
  };
};

const runTextGradOptimization = async <T>(
  config: TextGradRunConfig<T>,
  onFinalStream?: StreamHandler
): Promise<{ result: T; trace: TextGradOptimizationTrace }> => {
  const promptSet = getActivePromptSet();
  const compactGradientRequirements = promptSet.contentGradientRequirements
    .filter(item => !item.includes('只输出反馈'));
  const compact = await runJsonTask({
    task: `compact-textgrad-${config.task}`,
    objective: config.objective,
    schema: {
      draft: {
        candidateSummary: 'string, no more than 80 Chinese characters',
        qualityRisks: ['string, no more than 40 Chinese characters each']
      },
      textualGradient: {
        critique: 'string',
        keep: ['string'],
        improve: ['string'],
        risks: ['string']
      },
      optimized: config.schema
    },
    requirements: [
      '在一次响应内完成 TextGrad 的三步：先用 draft 摘要候选方向，再给出 textualGradient，最后根据反馈输出 optimized。',
      'draft 只写摘要和风险，不要重复输出完整润色结果；optimized 必须符合对应任务 schema，是最终用于页面展示和回写的结果。',
      'textualGradient 必须解释 draft 相对 objective 的不足，并说明如何修正。',
      'contentOptimizerRequirements 中的 currentCandidate 指本次响应里的 draft。',
      '为提高响应速度，所有数组只保留最关键项目，文字保持简洁。',
      ...config.requirements,
      ...compactGradientRequirements,
      ...promptSet.contentOptimizerRequirements
    ],
    input: {
      originalInput: config.input
    }
  }, onFinalStream, config.requestOptions);

  const draft = asJsonRecord(compact.parsed?.draft);
  const optimized = asJsonRecord(compact.parsed?.optimized);
  const textualGradient = formatTextGradient(
    asJsonRecord(compact.parsed?.textualGradient),
    stringifyTraceValue(compact.parsed?.textualGradient, compact.rawText)
  );
  const normalized = config.normalize(
    optimized || compact.parsed,
    optimized ? stringifyTraceValue(optimized) : compact.rawText
  );

  return {
    result: normalized,
    trace: {
      objective: config.objective,
      draft: stringifyTraceValue(draft, compact.rawText),
      textualGradient,
      optimized: stringifyTraceValue(optimized, compact.rawText),
      iterations: 1
    }
  };
};

const resolveTargetPosition = (snapshot: ResumeContentSnapshot, targetPosition?: string): string => {
  return String(targetPosition || snapshot.personalInfo.applicationPosition || '').trim();
};

const buildSnapshotSummary = (snapshot: ResumeContentSnapshot, targetPosition?: string) => {
  return {
    targetPosition: resolveTargetPosition(snapshot, targetPosition),
    education: snapshot.education.map(item => ({
      school: item.school,
      degree: item.degree,
      major: item.major,
      startDate: item.startDate,
      endDate: item.endDate
    })),
    workExperience: snapshot.workExperience.map((item, index) => ({
      fieldPath: `workExperience[${index}].description`,
      company: item.company,
      position: item.position,
      description: limitText(item.description)
    })),
    projects: snapshot.projects.map((item, index) => ({
      briefIntroductionPath: `projects[${index}].briefIntroduction`,
      descriptionPath: `projects[${index}].description`,
      projectName: item.projectName,
      role: item.role,
      briefIntroduction: limitText(item.briefIntroduction, 500),
      description: limitText(item.description)
    })),
    skills: snapshot.skills.map((item, index) => ({
      fieldPath: `skills[${index}].skillName`,
      skillName: item.skillName
    })),
    honors: snapshot.honors.map((item, index) => ({
      fieldPath: `honors[${index}].description`,
      honorName: item.honorName,
      description: limitText(item.description, 500)
    })),
    summary: limitText(snapshot.summary, 800)
  };
};

const buildStructureSnapshotSummary = (snapshot: ResumeContentSnapshot, targetPosition?: string) => ({
  targetPosition: resolveTargetPosition(snapshot, targetPosition),
  sectionOverview: {
    educationCount: snapshot.education.length,
    workExperienceCount: snapshot.workExperience.length,
    projectCount: snapshot.projects.length,
    skillCount: snapshot.skills.length,
    honorCount: snapshot.honors.length,
    hasSummary: Boolean(snapshot.summary?.trim())
  },
  education: snapshot.education.slice(0, 3).map(item => ({
    school: item.school,
    degree: item.degree,
    major: item.major
  })),
  workExperience: snapshot.workExperience.slice(0, 5).map((item, index) => ({
    index: index + 1,
    company: item.company,
    position: item.position,
    keyContent: limitText(item.description, 240)
  })),
  projects: snapshot.projects.slice(0, 5).map((item, index) => ({
    index: index + 1,
    projectName: item.projectName,
    role: item.role,
    briefIntroduction: limitText(item.briefIntroduction, 160),
    keyContent: limitText(item.description, 240)
  })),
  skills: snapshot.skills
    .map(item => item.skillName)
    .filter(Boolean)
    .slice(0, 20),
  honors: snapshot.honors.slice(0, 5).map(item => ({
    honorName: item.honorName,
    description: limitText(item.description, 160)
  })),
  summary: limitText(snapshot.summary, 280)
});

const buildPolishableTargets = (snapshot: ResumeContentSnapshot): PolishableTarget[] => {
  const targets: PolishableTarget[] = [];

  snapshot.workExperience.forEach((item, index) => {
    if (item.description?.trim()) {
      targets.push({
        fieldPath: `workExperience[${index}].description`,
        label: `第 ${index + 1} 条工作经历描述`,
        text: limitText(item.description, 900)
      });
    }
  });

  snapshot.projects.forEach((item, index) => {
    if (item.briefIntroduction?.trim()) {
      targets.push({
        fieldPath: `projects[${index}].briefIntroduction`,
        label: `第 ${index + 1} 条项目经历简介`,
        text: limitText(item.briefIntroduction, 500)
      });
    }
    if (item.description?.trim()) {
      targets.push({
        fieldPath: `projects[${index}].description`,
        label: `第 ${index + 1} 条项目经历描述`,
        text: limitText(item.description, 900)
      });
    }
  });

  snapshot.honors.forEach((item, index) => {
    if (item.description?.trim()) {
      targets.push({
        fieldPath: `honors[${index}].description`,
        label: `第 ${index + 1} 条荣誉奖项描述`,
        text: limitText(item.description, 500)
      });
    }
  });

  if (snapshot.summary?.trim()) {
    targets.push({
      fieldPath: 'summary',
      label: '个人总结',
      text: limitText(snapshot.summary, 800)
    });
  }

  return targets;
};

const summarizeStructureAdvice = (analysis?: ResumeStructureAnalysis | null): JsonRecord | null => {
  if (!analysis) return null;
  const takeAdvice = (items: ResumeStructureAdvice[]) =>
    items
      .slice(0, 3)
      .map(item => ({
        priority: item.priority,
        section: item.relatedSection || 'overall',
        title: item.title,
        advice: limitText(item.advice, 120)
      }));

  return {
    targetPosition: analysis.targetPosition,
    overallJudgement: limitText(analysis.overallJudgement, 180),
    sectionOrderSuggestions: takeAdvice(analysis.sectionOrderSuggestions),
    experienceSelectionSuggestions: takeAdvice(analysis.experienceSelectionSuggestions),
    missingContentSuggestions: takeAdvice(analysis.missingContentSuggestions),
    riskWarnings: analysis.riskWarnings.slice(0, 3)
  };
};

const buildSafetySummary = (
  targets: PolishableTarget[],
  normalized: OperationNormalizationResult
): PolishSafetySummary => ({
  allowedFieldCount: targets.length,
  returnedOperationCount: normalized.returnedOperationCount,
  acceptedOperationCount: normalized.operations.length,
  blockedOperationCount: normalized.droppedReasons.length,
  appliedFieldPaths: normalized.operations.map(item => item.fieldPath),
  blockedReasons: normalized.droppedReasons.slice(0, 5)
});

const normalizeOperationsWithMeta = (
  value: unknown,
  snapshot: ResumeContentSnapshot,
  source: string
): OperationNormalizationResult => {
  if (!Array.isArray(value)) {
    return {
      operations: [],
      droppedReasons: [],
      returnedOperationCount: 0
    };
  }
  const dropped: string[] = [];
  const operations = value
    .map(item => {
      const result = normalizeOperationWithReason(item, snapshot);
      if (!result.operation && result.reason) dropped.push(result.reason);
      return result.operation;
    })
    .filter((item): item is PolishOperation => Boolean(item));

  if (import.meta.env.DEV && dropped.length > 0) {
    console.warn(`[3-4 全文润色] ${source} 过滤了 ${dropped.length} 条不可写回结果`, dropped);
  }

  return {
    operations,
    droppedReasons: dropped,
    returnedOperationCount: value.length
  };
};

const repairEmptyBatchOperations = async (
  snapshot: ResumeContentSnapshot,
  targets: PolishableTarget[],
  previousSummary: string,
  previousSuggestions: ResumeSuggestion[],
  onStream?: StreamHandler
): Promise<BatchPolishResult | null> => {
  if (targets.length === 0) return null;

  const repair = await runJsonTask({
    task: 'repair-empty-batch-polish-operations',
    schema: {
      operations: [
        {
          fieldPath: 'string, must exactly equal one value from allowedTargets.fieldPath',
          oldValue: 'string, copy the matching allowedTargets.text',
          newValue: 'string, polished text and must be different from oldValue'
        }
      ],
      summary: 'string',
      suggestions: [
        {
          fieldPath: 'string | optional',
          problem: 'string',
          advice: 'string'
        }
      ]
    },
    requirements: [
      '上一次全文润色没有产生可写回 operations。现在必须修复这个问题。',
      '必须从 allowedTargets 中选择 1 到 3 个最值得优化的字段返回 operations。',
      'operation.fieldPath 必须逐字复制 allowedTargets[].fieldPath，禁止自行改写路径格式。',
      'operation.oldValue 必须复制对应 allowedTargets.text；operation.newValue 必须与 oldValue 不同。',
      '只优化表达结构、专业度、STAR 清晰度和可读性；不得添加原文没有提供的公司、指标、奖项或技术成果。',
      '如果缺少量化结果，在 suggestions 中提示补充，不要在 newValue 中虚构数字。',
      '输出必须是合法 JSON，且 operations 不能为空。'
    ],
    allowedTargets: targets.slice(0, 10),
    previousSummary,
    previousSuggestions
  }, onStream, batchJsonRequestOptions);

  const normalized = normalizeOperationsWithMeta(repair.parsed?.operations, snapshot, 'repair');
  if (normalized.operations.length === 0) return null;
  return {
    operations: normalized.operations,
    summary: String(repair.parsed?.summary || previousSummary || '已生成可应用的润色修改').trim(),
    suggestions: normalizeSuggestions(repair.parsed?.suggestions).length
      ? normalizeSuggestions(repair.parsed?.suggestions)
      : previousSuggestions,
    safety: buildSafetySummary(targets, normalized)
  };
};

export const polishExperienceStar = async (
  input: PolishExperienceInput,
  onStream?: StreamHandler
): Promise<PolishExperienceResult> => {
  const promptSet = getActivePromptSet();
  const taskPrompt = promptSet.tasks.singleStarPolish;
  if (!isAllowedPolishFieldPath(input.fieldPath)) {
    throw new Error('不支持的润色字段');
  }
  const schema = {
    fieldPath: 'string',
    originalText: 'string',
    polishedText: 'string',
    suggestions: ['string']
  };
  const payload = {
    fieldPath: input.fieldPath,
    originalText: input.originalText,
    targetPosition: input.targetPosition || input.snapshot.personalInfo.applicationPosition,
    resumeContext: buildSnapshotSummary(input.snapshot, input.targetPosition)
  };
  const objective = (taskPrompt.objective || []).join('\n');

  const { result, trace } = await runTextGradOptimization<PolishExperienceResult>({
    objective,
    task: 'single-star-polish',
    schema,
    requirements: taskPrompt.requirements,
    input: payload,
    normalize: (parsed, rawText) => ({
      fieldPath: String(parsed?.fieldPath || input.fieldPath),
      originalText: String(parsed?.originalText || input.originalText),
      polishedText: String(parsed?.polishedText || rawText).trim(),
      suggestions: asStringArray(parsed?.suggestions)
    })
  }, onStream);

  return {
    ...result,
    optimizationTrace: trace
  };
};

export const batchPolishResume = async (
  snapshot: ResumeContentSnapshot,
  onStream?: StreamHandler,
  options: BatchPolishOptions = {}
): Promise<BatchPolishResult> => {
  const promptSet = getActivePromptSet();
  const taskPrompt = promptSet.tasks.batchPolishResume;
  const mode: BatchPolishMode = options.mode || 'deep';
  const targetPosition = resolveTargetPosition(snapshot, options.targetPosition);
  const structureGuidance = summarizeStructureAdvice(options.structureAdvice);
  const polishableTargets = buildPolishableTargets(snapshot);
  if (polishableTargets.length === 0) {
    return {
      operations: [],
      summary: '当前简历没有可润色的经历类文本字段，请先补充工作经历、项目经历、荣誉描述或个人总结。',
      suggestions: [],
      mode,
      usedStructureAdvice: Boolean(structureGuidance),
      safety: {
        allowedFieldCount: 0,
        returnedOperationCount: 0,
        acceptedOperationCount: 0,
        blockedOperationCount: 0,
        appliedFieldPaths: [],
        blockedReasons: []
      }
    };
  }
  const schema = {
    operations: [
      {
        fieldPath: 'string, must exactly equal one value from allowedTargets.fieldPath',
        oldValue: 'string, copy the matching allowedTargets.text',
        newValue: 'string, polished text and must be different from oldValue'
      }
    ],
    summary: 'string',
    suggestions: [
      {
        fieldPath: 'string | optional',
        itemId: 'number | string | optional',
        problem: 'string',
        advice: 'string'
      }
    ]
  };
  const objective = (taskPrompt.objective || []).join('\n');
  const sharedInput = {
    snapshot: buildSnapshotSummary(snapshot, targetPosition),
    targetPosition,
    allowedTargets: mode === 'fast' ? polishableTargets.slice(0, 8) : polishableTargets,
    structureGuidance,
    outputRules: [
      '只允许从 allowedTargets 中选择字段生成 operations。',
      'fieldPath 必须逐字复制 allowedTargets.fieldPath。',
      '若 allowedTargets 非空，至少返回 1 条 operation；不要只返回 suggestions。',
      'newValue 必须比 oldValue 更清晰或更专业，但不得编造事实。',
      '如果 structureGuidance 存在，优先围绕其中的岗位导向建议选择和润色字段；仍然不得新增、删除或重排经历。'
    ]
  };

  if (mode === 'fast') {
    const quick = await runJsonTask({
      task: 'fast-batch-polish-resume',
      schema,
      requirements: [
        ...taskPrompt.requirements,
        '快速模式只做一次轻量生成，不展开 TextGrad 中间步骤。',
        '优先选择 1 到 4 个最有价值、最容易安全写回的字段生成 operations。',
        'summary 用一句话概括本次修改方向，suggestions 最多 3 条。'
      ],
      input: sharedInput
    }, onStream, fastBatchJsonRequestOptions);

    const normalized = normalizeOperationsWithMeta(quick.parsed?.operations, snapshot, 'fast');
    const result: BatchPolishResult = {
      operations: normalized.operations,
      summary: String(quick.parsed?.summary || '已生成快速润色修改').trim(),
      suggestions: normalizeSuggestions(quick.parsed?.suggestions).slice(0, 3),
      mode,
      usedStructureAdvice: Boolean(structureGuidance),
      safety: buildSafetySummary(sharedInput.allowedTargets, normalized)
    };

    if (result.operations.length === 0) {
      const repaired = await repairEmptyBatchOperations(
        snapshot,
        sharedInput.allowedTargets,
        result.summary,
        result.suggestions,
        onStream
      );
      if (repaired) {
        return {
          ...repaired,
          mode,
          usedStructureAdvice: Boolean(structureGuidance)
        };
      }
    }

    return result;
  }

  const { result, trace } = await runTextGradOptimization<BatchPolishResult>({
    objective,
    task: 'batch-polish-resume',
    schema,
    requirements: taskPrompt.requirements,
    input: sharedInput,
    normalize: (parsed) => {
      const normalized = normalizeOperationsWithMeta(parsed?.operations, snapshot, 'textgrad');

      return {
        operations: normalized.operations,
        summary: String(parsed?.summary || '').trim(),
        suggestions: normalizeSuggestions(parsed?.suggestions),
        mode,
        usedStructureAdvice: Boolean(structureGuidance),
        safety: buildSafetySummary(sharedInput.allowedTargets, normalized)
      };
    },
    requestOptions: batchJsonRequestOptions
  }, onStream);

  if (result.operations.length === 0) {
    const repaired = await repairEmptyBatchOperations(
      snapshot,
      polishableTargets,
      result.summary,
      result.suggestions,
      onStream
    );
    if (repaired) {
      return {
        ...repaired,
        mode,
        usedStructureAdvice: Boolean(structureGuidance),
        optimizationTrace: {
          ...trace,
          textualGradient: `${trace.textualGradient}\n修复反馈：首轮未生成合法可写回 operations，已按 allowedTargets 重新生成字段级修改。`
        }
      };
    }
  }

  return {
    ...result,
    mode,
    usedStructureAdvice: Boolean(structureGuidance),
    optimizationTrace: trace
  };
};

export const analyzeResumeStructure = async (
  snapshot: ResumeContentSnapshot,
  onStream?: StreamHandler,
  options: AITaskOptions = {}
): Promise<ResumeStructureAnalysis> => {
  const targetPosition = resolveTargetPosition(snapshot, options.targetPosition);
  if (!targetPosition) {
    throw new Error('请先填写目标岗位方向，再生成岗位结构建议');
  }
  const response = await runJsonTask({
    task: 'analyze-resume-structure',
    schema: {
      targetPosition: 'string',
      structureScore: 'number 0-100',
      overallJudgement: 'string, no more than 80 Chinese characters',
      adviceItems: [
        {
          category: 'order | selection | missing | risk',
          relatedSection: 'projects | workExperience | skills | honors | summary | overall',
          priority: 'high | medium | low',
          title: 'string, no more than 12 Chinese characters',
          problem: 'string, no more than 40 Chinese characters',
          advice: 'string, no more than 70 Chinese characters'
        }
      ]
    },
    requirements: [
      '这是简历整体结构诊断，不要润色具体句子，不要返回可写回 operation。',
      '围绕 targetPosition 判断模块顺序、经历取舍、内容补充和风险，不要编造用户没有提供的新经历。',
      '只返回一个 adviceItems 数组，不要返回 sectionOrderSuggestions、experienceSelectionSuggestions、missingContentSuggestions。',
      'adviceItems 总数 4 到 6 条：order 至少 1 条，selection 至少 1 条，missing 至少 1 条，risk 最多 1 条。',
      '建议必须具体可执行，例如保留哪类经历、弱化哪类经历、是否补充项目结果、是否调整模块顺序。',
      '所有中文文本保持短句，避免长段解释。',
      '只输出合法 JSON，不要 Markdown，不要额外解释，JSON 字段名必须严格符合 schema。'
    ],
    targetPosition,
    snapshot: buildStructureSnapshotSummary(snapshot, targetPosition)
  }, onStream, structureJsonRequestOptions);

  const normalized =
    normalizeFlatStructureAnalysis(response.parsed, snapshot, targetPosition) ||
    normalizeStructureAnalysis(response.parsed, snapshot, targetPosition) ||
    normalizeStructureAnalysisFromAiText(response.rawText, response.parsed, snapshot, targetPosition);
  if (normalized) return normalized;
  throw new Error('模型返回的岗位结构建议格式异常，请稍后重试或缩短简历内容');
};

export const evaluateResume = async (
  snapshot: ResumeContentSnapshot,
  onStream?: StreamHandler,
  options: AITaskOptions = {}
): Promise<ResumeEvaluation> => {
  const promptSet = getActivePromptSet();
  const targetPosition = resolveTargetPosition(snapshot, options.targetPosition);
  const messages: DialogueHistory = [
    { role: 'system', content: promptSet.systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'evaluate-resume',
        schema: {
          scores: {
            completeness: 'number 0-100',
            professionalism: 'number 0-100',
            readability: 'number 0-100',
            jobMatch: 'number 0-100',
            total: 'number 0-100'
          },
          comments: ['string'],
          suggestions: [
            {
              fieldPath: 'string | optional',
              itemId: 'number | string | optional',
              problem: 'string',
              advice: 'string'
            }
          ]
        },
        requirements: promptSet.tasks.evaluateResume.requirements,
        targetPosition,
        snapshot: buildSnapshotSummary(snapshot, targetPosition)
      })
    }
  ];

  const responseText = await completeDialogue(messages, onStream, evaluationJsonRequestOptions);
  const parsed = parseJsonObject<JsonRecord>(responseText);
  const normalized = normalizeEvaluationResult(parsed);
  if (normalized) return normalized;

  const repaired = await runJsonTask({
    task: 'repair-evaluation-json',
    schema: {
      scores: {
        completeness: 'number 0-100',
        professionalism: 'number 0-100',
        readability: 'number 0-100',
        jobMatch: 'number 0-100',
        total: 'number 0-100'
      },
      comments: ['string'],
      suggestions: [
        {
          fieldPath: 'string | optional',
          itemId: 'number | string | optional',
          problem: 'string',
          advice: 'string'
        }
      ]
    },
    requirements: [
      '上一轮质量评分没有生成可解析的有效 JSON，现在必须修复。',
      '必须返回 scores，五个分数字段都必须是 0-100 的数字，不要写“分”或百分号。',
      'comments 最多 3 条，suggestions 最多 6 条。',
      '只输出合法 JSON，不要 Markdown，不要额外解释。'
    ],
    rawResponse: limitText(responseText, 1600),
    targetPosition,
    snapshot: buildSnapshotSummary(snapshot, targetPosition)
  }, onStream, evaluationJsonRequestOptions);

  const repairedEvaluation = normalizeEvaluationResult(
    validateParsedResult(repaired.parsed, repaired.rawText, '质量评分修复')
  );
  if (!repairedEvaluation) {
    throw new Error('AI 未返回可解析的质量评分结果');
  }
  return repairedEvaluation;
};
