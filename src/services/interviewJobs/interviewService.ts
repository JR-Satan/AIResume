import type {
  InterviewDimension,
  InterviewEvaluation,
  InterviewQuestion,
  InterviewQuestionAnalysis,
  InterviewType,
  JobProfile,
  ResumeFeatures
} from '@/types/interviewJobs';
import { callInterviewLlmForJson } from './llmClient';

// ==================== 面试维度定义 ====================

export const INTERVIEW_DIMENSIONS: InterviewDimension[] = [
  '专业能力',
  '项目表达',
  '逻辑结构',
  '沟通清晰',
  '岗位动机'
];

// ==================== 内部类型 ====================

interface QuestionPayload {
  questions?: Array<{
    question?: string;
    dimension?: InterviewDimension;
    referencePoints?: string[];
    reference_points?: string[];
    type?: InterviewType;
    source?: 'resume' | 'jd' | 'hybrid' | 'preset';
  }>;
}

interface EvaluationPayload {
  scores?: Partial<Record<InterviewDimension, number>>;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  questionAnalyses?: QuestionAnalysisPayload[];
  question_analyses?: QuestionAnalysisPayload[];
  suggestedScript?: string;
  suggested_script?: string;
}

interface QuestionAnalysisPayload {
  questionId?: number;
  question_id?: number;
  score?: number;
  analysis?: string;
  strengths?: string[];
  improvements?: string[];
}

interface InterviewQaPair {
  question: InterviewQuestion;
  answer: string;
}

// ==================== 核心：生成面试问题 ====================

export async function generateInterviewQuestions(
  features: ResumeFeatures,
  job: JobProfile,
  count = 5,
  onLlmError?: (error: string) => void
): Promise<InterviewQuestion[]> {
  // 1. 尝试调用大模型
  const llmQuestions = await tryGenerateWithLLM(features, job, count, onLlmError);

  // 2. LLM 成功且数量足够
  if (llmQuestions.length >= count) {
    return ensureDimensionCoverage(llmQuestions, features, job, count);
  }

  // 3. LLM 失败或不足，用本地兜底题库
  const fallback = fallbackQuestions(features, job, count);

  // 4. 合并
  if (llmQuestions.length > 0) {
    const merged = mergeQuestions(llmQuestions, fallback, count);
    return ensureDimensionCoverage(merged, features, job, count);
  }

  return ensureDimensionCoverage(fallback, features, job, count);
}

function mergeQuestions(
  llmQuestions: InterviewQuestion[],
  fallbackPool: InterviewQuestion[],
  count: number
): InterviewQuestion[] {
  const result: InterviewQuestion[] = [];
  const usedDimensions = new Set<InterviewDimension>();

  for (const q of llmQuestions) {
    if (result.length < count) {
      result.push(q);
      usedDimensions.add(q.dimension);
    }
  }

  const dimensionFirst = fallbackPool.filter(q => !usedDimensions.has(q.dimension));
  const rest = fallbackPool.filter(q => usedDimensions.has(q.dimension));

  for (const q of [...dimensionFirst, ...rest]) {
    if (result.length >= count) break;
    if (!result.some(r => r.question === q.question)) {
      result.push(q);
    }
  }

  return result.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
}

function ensureDimensionCoverage(
  questions: InterviewQuestion[],
  features: ResumeFeatures,
  job: JobProfile,
  count: number
): InterviewQuestion[] {
  const covered = new Set(questions.map(q => q.dimension));
  const missing = INTERVIEW_DIMENSIONS.filter(d => !covered.has(d));

  const result = [...questions];
  for (const dim of missing) {
    result.push(buildDimensionFiller(dim, features, job));
  }

  return result.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
}

function buildDimensionFiller(
  dimension: InterviewDimension,
  features: ResumeFeatures,
  job: JobProfile
): InterviewQuestion {
  const skill = features.skills[0] || job.keywords[0] || '相关技术';
  const project = features.projectKeywords[0] || '项目经历';

  const templates: Record<InterviewDimension, InterviewQuestion> = {
    '专业能力': {
      id: 0, question: `请结合你对 ${skill} 的掌握，说明你在「${job.title}」岗位中最核心的专业能力是什么？有哪些代表性的技术成果？`,
      dimension: '专业能力', referencePoints: ['核心技术能力', '实际应用场景', '代表性成果'],
      type: 'technical', source: 'hybrid'
    },
    '项目表达': {
      id: 0, question: `请介绍你参与过的「${project}」项目，重点说明项目背景、你的角色、技术方案和最终成果。`,
      dimension: '项目表达', referencePoints: ['项目背景', '个人角色与贡献', '成果与影响'],
      type: 'behavioral', source: 'resume'
    },
    '逻辑结构': {
      id: 0, question: '面对一个复杂的业务问题，请描述你通常的分析思路和解决步骤，并举一个实际例子。',
      dimension: '逻辑结构', referencePoints: ['问题分析方法', '逻辑框架', '实际案例'],
      type: 'behavioral', source: 'preset'
    },
    '沟通清晰': {
      id: 0, question: `请用通俗易懂的语言向非技术人员解释 ${skill} 的核心原理和应用场景。`,
      dimension: '沟通清晰', referencePoints: ['表达清晰度', '类比能力', '受众意识'],
      type: 'hr', source: 'preset'
    },
    '岗位动机': {
      id: 0, question: `你为什么认为自己适合「${job.title}」这个岗位？你的职业规划与这个岗位如何契合？`,
      dimension: '岗位动机', referencePoints: ['岗位理解', '个人匹配度', '职业规划'],
      type: 'hr', source: 'hybrid'
    }
  };

  return templates[dimension];
}

// ==================== LLM 生成 ====================

async function tryGenerateWithLLM(
  features: ResumeFeatures,
  job: JobProfile,
  count: number,
  onLlmError?: (error: string) => void
): Promise<InterviewQuestion[]> {
  // 生成随机种子，确保每次调用产生不同的题目
  const seed = Date.now() % 10000;
  const formTypes = shuffleArray(['场景假设', '对比分析', '方案设计', '复盘反思', '技术深挖', '行为面试', '开放讨论']);
  const selectedForms = formTypes.slice(0, Math.min(count, formTypes.length));

  const response = await callInterviewLlmForJson<QuestionPayload>({
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(features, job, count, seed, selectedForms),
    temperature: 0.8  // 提高随机性，确保每次生成不同题目
  });

  if (!response.success || !response.data?.questions) {
    onLlmError?.(response.error || 'INVALID_QUESTION_RESPONSE');
    return [];
  }

  const questions = response.data.questions
    .filter(item => item.question && item.question.trim().length >= 8)
    .slice(0, count)
    .map((item, index) => ({
      id: index + 1,
      question: item.question!,
      dimension: item.dimension || INTERVIEW_DIMENSIONS[index % INTERVIEW_DIMENSIONS.length],
      referencePoints: item.referencePoints || item.reference_points || [],
      type: item.type || inferTypeFromDimension(item.dimension || INTERVIEW_DIMENSIONS[index % INTERVIEW_DIMENSIONS.length]),
      source: item.source || 'hybrid'
    }));

  if (questions.length) return questions;
  onLlmError?.('INVALID_QUESTION_RESPONSE');
  return [];
}

function buildSystemPrompt(): string {
  return `你是一位拥有20年经验的严格的资深中文企业面试官，擅长根据候选人简历和目标岗位JD设计有针对性的模拟面试题。

【核心原则 - 必须严格遵守】
1. 岗位优先：题目必须围绕目标岗位（job.title）的核心技术栈和职责要求来设计。简历中的项目经历只能作为辅助素材，不能喧宾夺主。
   例如：如果目标岗位是"人工智能算法工程师"，题目必须围绕机器学习、深度学习、NLP、CV等AI领域技术，不能出前端/后端/测试等无关题目。
2. 技术栈匹配：题目中涉及的技术必须与岗位JD中的keywords一致。如果岗位要求Python和PyTorch，题目就围绕这些技术展开。
3. 简历辅助：简历中的项目经历用于让题目更具体（如"请结合你在XX项目中的经验"），但题目的核心考察点必须是岗位要求的技能。

【出题原则 - 题目必须多样化，避免框架雷同】
1. 针对性：每道题必须紧密结合岗位JD中的明确要求，禁止出"请谈谈你对XX的理解"这类泛泛之谈的题目
2. 具体性：题目中要出现岗位JD中的具体关键词（如具体技术名、业务场景），让候选人能围绕岗位要求作答
3. 区分度：题目应考察不同深度——基础理解、深度应用、综合分析，避免所有题目都是同一难度
4. 多样性：题目形式要丰富多变，包括但不限于：
   - 场景假设题："如果遇到XX情况，你会怎么做？"
   - 对比分析题："请比较A和B的优劣，并说明选择理由"
   - 方案设计题："请设计一个XX方案来解决YY问题"
   - 复盘反思题："回顾XX项目，你认为最大的收获和遗憾是什么？"
   - 技术深挖题："请详细说明XX技术的底层原理和实现细节"
   - 行为面试题："请用STAR法则描述一次XX经历"
   - 开放讨论题："你如何看待XX技术的发展趋势？"
5. 维度覆盖：每道题必须明确归属以下五个维度之一：
   - 专业能力：考察技术深度、知识广度、实践能力（占比最高，约60%的题目）
   - 项目表达：考察项目描述清晰度、贡献突出度、成果量化（约20%）
   - 逻辑结构：考察思维条理性、问题拆解能力、方案完整性（约10%）
   - 沟通清晰：考察表达流畅度、语言组织、受众意识（约5%）
   - 岗位动机：考察岗位理解、匹配度、职业规划清晰度（约5%）
6. 参考要点：每道题提供3个referencePoints，指引候选人答题方向
7. 题目标注：每道题标注type（technical/behavioral/hr/business）和source（resume/jd/hybrid/preset）

【输出格式】
只输出合法JSON，不要输出Markdown代码块，格式如下：
{
  "questions": [
    {
      "question": "具体的面试问题",
      "dimension": "专业能力|项目表达|逻辑结构|沟通清晰|岗位动机",
      "referencePoints": ["要点1", "要点2", "要点3"],
      "type": "technical|behavioral|hr|business",
      "source": "resume|jd|hybrid|preset"
    }
  ]
}`;
}

function buildUserPrompt(
  features: ResumeFeatures,
  job: JobProfile,
  count: number,
  seed: number,
  selectedForms: string[]
): string {
  const resumeSummary = buildResumeSummary(features);
  const jobSummary = buildJobSummary(job);

  return JSON.stringify({
    instruction: `请根据以下简历特征和目标岗位信息，生成 ${count} 道模拟面试题。

【重要：本次生成必须与之前不同】
随机种子：${seed}。请确保本次生成的题目在角度、措辞、切入点上与之前的生成有明显差异。

【简历特征 - 仅作为辅助素材】
${resumeSummary}

【目标岗位 - 这是出题的核心依据】
${jobSummary}

【出题要求 - 必须严格遵守】
1. 岗位专有性：所有题目必须围绕目标岗位「${job.title}」的核心技术栈和职责来设计。题目中涉及的技术必须来自岗位JD的keywords（${job.keywords.join('、')}），不能偏离到其他领域。
2. 专业能力优先：${count} 道题中，至少 ${Math.ceil(count * 0.6)} 道必须是专业能力维度，考察岗位核心技术。
3. 简历辅助：简历中的项目经历只能作为"请结合你在XX项目中的经验"的辅助素材，题目的核心考察点必须是岗位要求的技能。
4. 维度分布：专业能力约60%、项目表达约20%、逻辑结构约10%、沟通清晰约5%、岗位动机约5%
5. 题目中要出现岗位JD中的具体关键词，让候选人能围绕岗位要求作答
6. 每道题提供3个referencePoints
7. 本次优先使用以下题目形式：${selectedForms.join('、')}
8. 避免泛泛而谈的通用题，要有针对性和区分度`,
    features: {
      targetPosition: features.targetPosition,
      skills: features.skills,
      projectKeywords: features.projectKeywords,
      workKeywords: features.workKeywords,
      experienceYears: features.experienceYears,
      educationLevel: features.educationLevel
    },
    job: {
      title: job.title,
      industry: job.industry,
      keywords: job.keywords,
      responsibilities: job.responsibilities,
      requirements: job.requirements
    },
    count,
    seed
  });
}

function buildResumeSummary(features: ResumeFeatures): string {
  const parts: string[] = [];
  if (features.targetPosition) parts.push(`目标岗位：${features.targetPosition}`);
  parts.push(`学历：${features.educationLevel}`);
  parts.push(`经验年限：${features.experienceYears}年`);
  if (features.skills.length) parts.push(`技能：${features.skills.slice(0, 10).join('、')}`);
  if (features.projectKeywords.length) parts.push(`项目关键词：${features.projectKeywords.slice(0, 8).join('、')}`);
  if (features.workKeywords.length) parts.push(`工作关键词：${features.workKeywords.slice(0, 8).join('、')}`);
  if (features.honors.length) parts.push(`荣誉：${features.honors.slice(0, 5).join('、')}`);
  return parts.join('\n');
}

function buildJobSummary(job: JobProfile): string {
  const parts: string[] = [];
  parts.push(`岗位名称：${job.title}`);
  parts.push(`行业：${job.industry}`);
  parts.push(`级别：${job.level}`);
  if (job.keywords.length) parts.push(`关键词：${job.keywords.join('、')}`);
  if (job.responsibilities.length) parts.push(`职责：${job.responsibilities.join('；')}`);
  if (job.requirements.length) parts.push(`要求：${job.requirements.join('；')}`);
  return parts.join('\n');
}

function inferTypeFromDimension(dimension: InterviewDimension): InterviewType {
  const map: Record<InterviewDimension, InterviewType> = {
    '专业能力': 'technical',
    '项目表达': 'behavioral',
    '逻辑结构': 'behavioral',
    '沟通清晰': 'hr',
    '岗位动机': 'hr'
  };
  return map[dimension];
}

// ==================== 本地兜底题库 ====================

export function fallbackQuestions(
  features: ResumeFeatures,
  job: JobProfile,
  count: number
): InterviewQuestion[] {
  const pool = buildFallbackPool(features, job);

  // 均匀选取：确保五维度全覆盖 + 难度分散
  const selected = selectBalancedQuestions(pool, count);

  return selected.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
}

function selectBalancedQuestions(pool: InterviewQuestion[], count: number): InterviewQuestion[] {
  const selected: InterviewQuestion[] = [];
  const usedKeys = new Set<string>();
  const qKey = (q: InterviewQuestion) => q.question.slice(0, 40);

  // 第一轮：每个维度至少选 1 题
  for (const dim of INTERVIEW_DIMENSIONS) {
    const candidates = pool.filter(q => q.dimension === dim && !usedKeys.has(qKey(q)));
    if (candidates.length > 0) {
      // 优先选不同难度的题
      const difficulties = selected.map(q => assessQuestionDifficulty(q));
      const candidate = candidates.find(q => !difficulties.includes(assessQuestionDifficulty(q)))
        || candidates[0];
      selected.push(candidate);
      usedKeys.add(qKey(candidate));
    }
  }

  // 第二轮：从剩余题目中补充
  const remaining = pool.filter(q => !usedKeys.has(qKey(q)));
  for (const q of remaining) {
    if (selected.length >= count) break;
    selected.push(q);
  }

  return selected;
}

function buildFallbackPool(features: ResumeFeatures, job: JobProfile): InterviewQuestion[] {
  return [
    ...getTechnicalQuestions(features, job),
    ...getBehavioralQuestions(features, job),
    ...getHRQuestions(features, job),
    ...getBusinessQuestions(features, job)
  ];
}

// ==================== 技术面题库（8题） ====================

function getTechnicalQuestions(features: ResumeFeatures, job: JobProfile): InterviewQuestion[] {
  const s1 = features.skills[0] || job.keywords[0] || '核心技术';
  const s2 = features.skills[1] || job.keywords[1] || '相关框架';
  const s3 = features.skills[2] || job.keywords[2] || '辅助工具';
  const p1 = features.projectKeywords[0] || '项目';
  const p2 = features.projectKeywords[1] || '另一个项目';

  return [
    { id: 0, question: `在「${job.title}」岗位中，${s1} 是核心技能。请结合你在「${p1}」中的实际经验，说明你如何用 ${s1} 解决过一个具体的技术难题？最终效果如何？`, dimension: '专业能力', referencePoints: ['具体技术难题描述', '解决方案与实现细节', '量化效果与收获'], type: 'technical', source: 'hybrid' },
    { id: 0, question: `如果让你从零搭建一个基于 ${s1} + ${s2} 的系统，你会如何进行技术选型、架构设计和模块划分？请说明关键决策的理由。`, dimension: '专业能力', referencePoints: ['技术选型依据与对比', '架构设计思路', '模块划分与扩展性考虑'], type: 'technical', source: 'jd' },
    { id: 0, question: `请对比 ${s1} 和 ${s3} 在「${p2}」这类项目中的适用场景。如果让你重新选择技术方案，你会怎么选？为什么？`, dimension: '专业能力', referencePoints: ['技术特性对比', '业务场景适配', '决策依据与权衡'], type: 'technical', source: 'resume' },
    { id: 0, question: `你在简历中提到「${p1}」项目，请详细说明该项目的技术架构、你负责的核心模块，以及遇到的最大技术挑战和解决方案。`, dimension: '项目表达', referencePoints: ['项目背景与技术架构', '个人职责与核心贡献', '技术难点与解决方案'], type: 'technical', source: 'resume' },
    { id: 0, question: `回顾「${p1}」项目，你认为在技术方案上有哪些可以改进的地方？如果重新做一次，你会做出哪些不同的决策？`, dimension: '项目表达', referencePoints: ['原方案的不足之处', '改进思路与替代方案', '经验教训与成长'], type: 'technical', source: 'resume' },
    { id: 0, question: `如果线上系统出现性能瓶颈（如接口响应慢、内存泄漏），你会如何定位问题、分析原因并给出优化方案？请结合 ${s1} 生态中的工具和方法来说明。`, dimension: '逻辑结构', referencePoints: ['问题定位方法与工具', '性能分析思路', '优化方案设计与验证'], type: 'technical', source: 'hybrid' },
    { id: 0, question: `假设你需要为「${p1}」设计一套完整的测试策略，包括单元测试、集成测试和端到端测试。请描述你的测试方案和工具选型。`, dimension: '逻辑结构', referencePoints: ['测试分层策略', '工具选型与理由', '覆盖率与质量指标'], type: 'technical', source: 'hybrid' },
    { id: 0, question: `请用通俗易懂的语言向非技术人员解释 ${s1} 的核心原理，并举例说明它在「${p1}」项目中解决了什么实际问题。`, dimension: '沟通清晰', referencePoints: ['通俗类比方法', '核心原理简化表达', '实际应用场景说明'], type: 'technical', source: 'hybrid' }
  ];
}

// ==================== 行为面题库（8题） ====================

function getBehavioralQuestions(features: ResumeFeatures, job: JobProfile): InterviewQuestion[] {
  const p1 = features.projectKeywords[0] || '项目经历';
  const p2 = features.projectKeywords[1] || '另一个项目';
  const w1 = features.workKeywords[0] || '工作经历';
  const sk = features.skills[0] || job.keywords[0] || '相关技能';

  return [
    { id: 0, question: `请用 STAR 法则（情境、任务、行动、结果）详细描述你在「${p1}」中承担的角色和做出的贡献，重点说明你面对的核心挑战。`, dimension: '项目表达', referencePoints: ['情境背景(Situation)', '任务目标(Task)', '具体行动(Action)', '量化结果(Result)'], type: 'behavioral', source: 'resume' },
    { id: 0, question: `在「${p2}」项目中，你认为自己最大的收获是什么？有没有什么遗憾或可以做得更好的地方？`, dimension: '项目表达', referencePoints: ['核心收获与成长', '遗憾或不足之处', '改进方向与行动计划'], type: 'behavioral', source: 'resume' },
    { id: 0, question: `请分享一次你在「${p1}」或工作中遇到重大困难或失败的经历。当时你是怎么应对的？如果重来一次你会怎么做？`, dimension: '沟通清晰', referencePoints: ['困难具体描述', '应对措施与调整', '反思与改进'], type: 'behavioral', source: 'resume' },
    { id: 0, question: `描述一次你与团队成员在技术方案或项目方向上产生分歧的经历。你是如何沟通、说服或妥协的？最终结果如何？`, dimension: '沟通清晰', referencePoints: ['分歧背景与核心矛盾', '沟通方式与策略', '最终结果与反思'], type: 'behavioral', source: 'preset' },
    { id: 0, question: `当多个任务同时推进且时间紧迫时，你是如何确定优先级并保证交付质量的？请结合「${w1}」中的具体例子说明。`, dimension: '逻辑结构', referencePoints: ['任务拆解方法', '优先级判断标准', '时间管理与质量保障'], type: 'behavioral', source: 'resume' },
    { id: 0, question: `请描述一次你在信息不完整的情况下需要做出重要技术决策的经历。你是如何收集信息、评估风险并最终决策的？`, dimension: '逻辑结构', referencePoints: ['信息收集方法', '风险评估框架', '决策过程与结果'], type: 'behavioral', source: 'preset' },
    { id: 0, question: `请分享一次你主动学习 ${sk} 或新领域并成功应用到实际工作中的经历。你的学习路径是什么？遇到了什么困难？`, dimension: '专业能力', referencePoints: ['学习动机与目标', '学习方法与路径', '应用效果与收获'], type: 'behavioral', source: 'hybrid' },
    { id: 0, question: `回顾你的职业经历，是什么驱动你选择了「${job.title}」这个方向？你在这个方向上最自豪的成就是什么？`, dimension: '岗位动机', referencePoints: ['职业选择动机', '关键成就与里程碑', '未来发展方向'], type: 'behavioral', source: 'hybrid' }
  ];
}

// ==================== HR面题库（8题） ====================

function getHRQuestions(_features: ResumeFeatures, job: JobProfile): InterviewQuestion[] {
  const ind = job.industry || '互联网';

  return [
    { id: 0, question: `请做一个 1-2 分钟的自我介绍，重点突出你与「${job.title}」岗位的匹配度，包括你的核心技能、项目经验和职业目标。`, dimension: '沟通清晰', referencePoints: ['个人背景概述', '核心能力与岗位匹配', '职业发展意向'], type: 'hr', source: 'hybrid' },
    { id: 0, question: `请谈谈你最大的优点和缺点各是什么。缺点方面，你目前采取了哪些改进措施？效果如何？`, dimension: '沟通清晰', referencePoints: ['优点与岗位关联', '缺点诚实且可控', '改进措施具体且有成效'], type: 'hr', source: 'preset' },
    { id: 0, question: `请描述一次你在工作中承受巨大压力的经历。你是如何调节情绪并保持工作效率的？`, dimension: '沟通清晰', referencePoints: ['压力来源与表现', '情绪调节方法', '工作成果与反思'], type: 'hr', source: 'preset' },
    { id: 0, question: `你为什么选择应聘「${job.title}」这个岗位？你对 ${ind} 行业和这个岗位的发展方向有什么了解和看法？`, dimension: '岗位动机', referencePoints: ['岗位理解与行业认知', '个人动机与匹配度', '对岗位发展方向的思考'], type: 'hr', source: 'jd' },
    { id: 0, question: `你对未来 3-5 年的职业规划是什么？「${job.title}」这个岗位如何帮助你实现这些目标？`, dimension: '岗位动机', referencePoints: ['短期目标(1-2年)具体化', '中期目标(3-5年)清晰', '与岗位发展路径的关联'], type: 'hr', source: 'hybrid' },
    { id: 0, question: `如果你入职后发现实际工作内容与预期有差距，你会如何调整心态和行动？请结合你过往的经历说明。`, dimension: '岗位动机', referencePoints: ['心态调整方式', '主动沟通与行动', '过往类似经历'], type: 'hr', source: 'preset' },
    { id: 0, question: `你对薪资有什么期望？如果薪资暂时达不到你的预期，你会如何综合考虑其他因素来做决定？`, dimension: '岗位动机', referencePoints: ['薪资预期的合理性', '综合考量因素', '决策思路与沟通方式'], type: 'hr', source: 'preset' },
    { id: 0, question: `你理想中的团队文化和领导风格是什么样的？请结合你过往的经历，说明你在什么样的环境下最能发挥价值。`, dimension: '岗位动机', referencePoints: ['理想团队文化描述', '与过往经历的关联', '个人价值发挥的条件'], type: 'hr', source: 'preset' }
  ];
}

// ==================== 行业/业务场景题库（8题） ====================

function getBusinessQuestions(features: ResumeFeatures, job: JobProfile): InterviewQuestion[] {
  const ind = job.industry || '互联网';
  const sk = features.skills[0] || job.keywords[0] || '相关技能';
  const p1 = features.projectKeywords[0] || '项目经历';

  return [
    { id: 0, question: `假设你入职「${job.title}」岗位后，公司要推出一款面向 ${ind} 领域的新产品。请描述你会如何开展需求分析、竞品调研和产品规划？`, dimension: '逻辑结构', referencePoints: ['需求调研方法', '竞品分析框架', '产品规划与优先级'], type: 'business', source: 'jd' },
    { id: 0, question: `如果「${p1}」项目的关键指标突然下降了 20%，你会如何分析原因并制定改进方案？请描述你的分析框架。`, dimension: '逻辑结构', referencePoints: ['数据异常定位方法', '根因分析框架', '改进方案与验证'], type: 'business', source: 'hybrid' },
    { id: 0, question: `假设你负责的系统在生产环境出现严重故障，影响了大量用户。请描述你会如何组织应急响应、问题修复和事后复盘。`, dimension: '逻辑结构', referencePoints: ['应急响应流程', '问题修复优先级', '事后复盘与改进'], type: 'business', source: 'preset' },
    { id: 0, question: `在 ${ind} 行业，你认为当前最大的技术或业务趋势是什么？这些趋势对「${job.title}」岗位有什么影响？你打算如何应对？`, dimension: '专业能力', referencePoints: ['行业趋势洞察', '对岗位的影响分析', '个人应对策略'], type: 'business', source: 'jd' },
    { id: 0, question: `你认为 ${sk} 在未来 3 年内会如何演进？这对「${job.title}」岗位的技能要求会带来什么变化？`, dimension: '专业能力', referencePoints: ['技术演进预判', '技能要求变化', '个人学习规划'], type: 'business', source: 'hybrid' },
    { id: 0, question: `如果业务方提出了一个在 ${sk} 技术上很难实现的需求，你会如何与业务方沟通、评估可行性并找到折中方案？`, dimension: '沟通清晰', referencePoints: ['需求理解与确认', '技术可行性分析', '沟通与折中方案'], type: 'business', source: 'hybrid' },
    { id: 0, question: `请描述一次你需要推动多个部门协作完成一个复杂项目的经历。你是如何协调资源、对齐目标并推动落地的？`, dimension: '沟通清晰', referencePoints: ['跨部门协调策略', '目标对齐方法', '推动落地的关键动作'], type: 'business', source: 'preset' },
    { id: 0, question: `请分析 ${ind} 行业中一个你熟悉的成功产品或服务，说明它的核心竞争力是什么？如果你来改进，会从哪些方面入手？`, dimension: '岗位动机', referencePoints: ['产品分析框架', '核心竞争力识别', '改进建议与优先级'], type: 'business', source: 'preset' }
  ];
}

// ==================== 题目难度评估 ====================

type QuestionDifficulty = 'basic' | 'medium' | 'hard';

function assessQuestionDifficulty(question: InterviewQuestion): QuestionDifficulty {
  if (question.type === 'business') return 'hard';
  if (question.type === 'technical' && (question.dimension === '专业能力' || question.dimension === '逻辑结构')) return 'hard';
  if (question.type === 'behavioral' && question.dimension === '项目表达') return 'medium';
  if (question.type === 'hr') return 'medium';
  return 'medium';
}

// ==================== 面试评估 ====================

export async function evaluateInterviewAnswer(
  question: InterviewQuestion,
  answer: string,
  features: ResumeFeatures,
  job: JobProfile
): Promise<InterviewEvaluation> {
  const text = answer.trim();

  // 无效输入检查
  const validityCheck = checkAnswerValidity(text);
  if (!validityCheck.valid) return validityCheck.evaluation!;

  const fallback = fallbackEvaluation(question, answer, features, job);

  const response = await callInterviewLlmForJson<EvaluationPayload>({
    systemPrompt: buildEvaluationSystemPrompt(),
    userPrompt: buildEvaluationUserPrompt(question, answer, features, job),
    temperature: 0.5
  });

  if (!response.success || !response.data?.scores) return fallback;

  const llmScores = normalizeScores(response.data.scores, fallback.scores);
  const llmTotal = averageScore(llmScores);

  // LLM 评分异常高但回答很短 → 降级
  if (llmTotal >= 3 && text.length < 30) return fallback;

  return {
    scores: llmScores,
    totalScore: llmTotal,
    summary: response.data.summary || fallback.summary,
    strengths: response.data.strengths?.length ? response.data.strengths.slice(0, 4) : fallback.strengths,
    improvements: response.data.improvements?.length ? response.data.improvements.slice(0, 4) : fallback.improvements,
    suggestedScript: response.data.suggestedScript || response.data.suggested_script || fallback.suggestedScript
  };
}

export async function evaluateInterviewSession(
  qaPairs: InterviewQaPair[],
  features: ResumeFeatures,
  job: JobProfile
): Promise<InterviewEvaluation> {
  const answerChecks = qaPairs.map(pair => ({
    pair,
    check: checkAnswerValidity(pair.answer.trim())
  }));
  const validPairs = answerChecks.filter(item => item.check.valid).map(item => item.pair);
  const fallbackAnalyses = qaPairs.map(pair => buildFallbackQuestionAnalysis(pair, features, job));

  if (!validPairs.length) {
    const invalidEvaluation = buildInvalidEvaluation('所有回答均为拒答、无实质内容或过于简短，无法形成有效评分。');
    invalidEvaluation.questionAnalyses = fallbackAnalyses;
    return invalidEvaluation;
  }

  const fallback = mergeEvaluations(
    qaPairs.map(({ question, answer }) => fallbackEvaluation(question, answer, features, job))
  );
  fallback.questionAnalyses = fallbackAnalyses;

  const response = await callInterviewLlmForJson<EvaluationPayload>({
    systemPrompt: buildSessionEvaluationSystemPrompt(),
    userPrompt: buildSessionEvaluationUserPrompt(validPairs, features, job),
    temperature: 0.1
  });

  if (!response.success || !response.data?.scores) return fallback;

  const validLlmScores = normalizeScores(response.data.scores, fallback.scores);
  const llmScores = applyInvalidAnswerPenalty(validLlmScores, validPairs.length, qaPairs.length);
  const llmTotal = averageScore(llmScores);
  const invalidCount = qaPairs.length - validPairs.length;

  return {
    scores: llmScores,
    totalScore: llmTotal,
    summary: invalidCount
      ? `${normalizeSummary(response.data.summary, fallback.summary)} 其中 ${invalidCount} 道题未提供有效回答，已按 0 分计入综合评分。`
      : normalizeSummary(response.data.summary, fallback.summary),
    strengths: normalizeSessionStrengths(response.data.strengths, fallback.strengths),
    improvements: response.data.improvements?.length ? response.data.improvements.slice(0, 4) : fallback.improvements,
    suggestedScript: response.data.suggestedScript || response.data.suggested_script || fallback.suggestedScript,
    questionAnalyses: normalizeQuestionAnalyses(
      response.data.questionAnalyses || response.data.question_analyses,
      qaPairs,
      fallback.questionAnalyses || []
    )
  };
}

// ==================== 输入有效性检查 ====================

function checkAnswerValidity(text: string): { valid: boolean; evaluation?: InterviewEvaluation } {
  const length = text.length;
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  const hasLetters = /[a-zA-Z]{2,}/.test(text);
  const compactText = text.toLowerCase().replace(/[\s.,，。!！?？、；;:'"“”‘’()（）]/g, '');
  const refusalPattern = /^(这个问题|这道题|这题|我|抱歉|对不起|确实|真的|实在|目前|暂时)*(不知道|不清楚|不了解|不懂|不会|没做过|没有做过|无法回答|答不上来|忘了|想不起来|跳过|放弃|无可奉告|不太清楚|不太了解|不太会|不太懂)(这个问题|这道题|这题|怎么回答|如何回答|该怎么回答|应该怎么回答|了|啊|呀|吧|呢)*$/;
  const englishRefusalPattern = /^(i(dk|dontknow)|idontknow|noidea|pass|skip|notsure|cannotanswer|cantanswer)$/;
  const isRefusal = compactText.length <= 40
    && (refusalPattern.test(compactText) || englishRefusalPattern.test(compactText));

  // 纯数字/符号（如 "1"、"123"、"456"）
  const strippedText = text.replace(/[\s.,，。、+\-*/%=()（）\d]/g, '');
  const isPureNumberOrSymbol = strippedText.length < 3;

  if (isRefusal) {
    return {
      valid: false,
      evaluation: buildInvalidEvaluation('该回答属于明确拒答或表示不了解，未提供可评分的信息。')
    };
  }
  if (isPureNumberOrSymbol && !hasChinese && !hasLetters) {
    return { valid: false, evaluation: buildInvalidEvaluation('回答内容无效（纯数字或符号），无法评估。请围绕面试问题给出完整的文字回答。') };
  }
  if (length < 10) {
    return { valid: false, evaluation: buildInvalidEvaluation('回答过于简短（不足10字），无法评估。请至少给出50字以上的完整回答。') };
  }
  if (length < 20 && !hasChinese) {
    return { valid: false, evaluation: buildInvalidEvaluation('回答内容过短且无实质中文内容，无法评估。请用中文给出完整回答。') };
  }
  return { valid: true };
}

function buildInvalidEvaluation(summary: string): InterviewEvaluation {
  const minScores = Object.fromEntries(INTERVIEW_DIMENSIONS.map(d => [d, 0])) as Record<InterviewDimension, number>;
  return {
    scores: minScores, totalScore: 0, summary,
    strengths: [],
    improvements: ['请围绕面试问题给出完整的文字回答', '回答应包含具体经历、技术细节或个人见解', '建议回答至少50字以上']
  };
}

// ==================== 评估 Prompt ====================

function buildEvaluationSystemPrompt(): string {
  return `你是一位严格但友好的中文面试评估官。请根据面试题和候选人回答，给出可解释的量化评分和详细反馈。

【无效输入判定 - 必须严格遵守】
如果回答是以下情况，所有维度必须给0分或1分，summary写"回答无效，无法评估"：
- 明确拒答或表示不了解，如“不知道”“不会”“不清楚”“没做过”“无法回答” → 所有维度0分，strengths必须为空数组
- 纯数字（如"1"、"123"、"456"）→ 所有维度0分
- 纯符号或乱码 → 所有维度0分
- 与面试问题完全无关的内容 → 所有维度1分
- 不足20字的极短回答 → 所有维度1分

【评分维度】（每个维度1-5分，使用0.5步长，如1.5、2.0、2.5...）
- 专业能力：技术深度、知识广度、实践能力、与岗位匹配度
- 项目表达：项目描述清晰度、贡献突出度、成果量化、STAR法则运用
- 逻辑结构：思维条理性、问题拆解能力、方案完整性、因果关系清晰
- 沟通清晰：表达流畅度、语言组织、受众意识、重点突出
- 岗位动机：岗位理解深度、匹配度、职业规划清晰度、诚意

【精细评分标准】（0.5步长）
- 5.0分：回答极为深入、有丰富案例和量化数据、逻辑严密（极少给出）
- 4.5分：回答深入、有具体案例和量化数据、逻辑清晰
- 4.0分：回答较好、有案例但不够深入、逻辑较清晰
- 3.5分：回答尚可、有基本案例但缺乏深度
- 3.0分：回答一般、有基本内容但缺乏深度和具体性
- 2.5分：回答偏浅、内容不够充实
- 2.0分：回答较浅、缺乏案例和细节
- 1.5分：回答很浅、几乎没有有效内容
- 1.0分：回答过于简短（<50字）或偏离问题
- 0分：纯数字/符号等无效输入

【反馈要求】
- summary：必须包含每个维度的得分和具体扣分/加分理由，格式：
  "整体表现XX。专业能力X分：理由；项目表达X分：理由；逻辑结构X分：理由；沟通清晰X分：理由；岗位动机X分：理由。建议XX。"
- strengths：2-3个具体优点，结合回答内容。无效输入返回空数组[]
- improvements：2-3个具体改进建议，有可操作性
- suggestedScript：根据题目给出可参考的回答话术模板（150-300字）。无效输入写"请先给出有效回答"

【输出格式】
只输出合法JSON，不要输出Markdown：
{
  "scores": { "专业能力": 3.5, "项目表达": 2.5, "逻辑结构": 3.0, "沟通清晰": 3.5, "岗位动机": 3.0 },
  "summary": "整体表现XX。专业能力X分：理由；...",
  "strengths": ["优点1", "优点2"],
  "improvements": ["改进1", "改进2"],
  "suggestedScript": "参考回答话术..."
}`;
}

function buildEvaluationUserPrompt(
  question: InterviewQuestion,
  answer: string,
  features: ResumeFeatures,
  job: JobProfile
): string {
  return JSON.stringify({
    instruction: '请根据以下面试题和候选人回答，给出详细的评分和反馈。使用0.5步长的小数评分。summary必须包含每个维度的得分和具体理由。suggestedScript必须提供可参考的回答话术。',
    question: { text: question.question, dimension: question.dimension, type: question.type, referencePoints: question.referencePoints },
    answer,
    context: {
      jobTitle: job.title, jobKeywords: job.keywords, jobRequirements: job.requirements,
      candidateSkills: features.skills.slice(0, 8), candidateProjects: features.projectKeywords.slice(0, 5)
    }
  });
}

function buildSessionEvaluationSystemPrompt(): string {
  return `你是一位严格但友好的中文面试评估官。请基于整场模拟面试的所有问答，给出综合评分和详细反馈。

【无效输入判定】
明确拒答或表示不了解（如“不知道”“不会”“不清楚”“没做过”“无法回答”）、纯数字、纯符号或不足10字的回答均为无效回答。无效回答按0分计入整场综合评分，不能提炼任何亮点。

【评分维度】（每个维度1-5分，使用0.5步长）
- 专业能力：技术深度、知识广度、实践能力、与岗位匹配度
- 项目表达：项目描述清晰度、贡献突出度、成果量化、STAR法则运用
- 逻辑结构：思维条理性、问题拆解能力、方案完整性、因果关系清晰
- 沟通清晰：表达流畅度、语言组织、受众意识、重点突出
- 岗位动机：岗位理解深度、匹配度、职业规划清晰度、诚意

【精细评分标准】（0.5步长）
- 5.0分：整场面试表现极为出色（极少给出）
- 4.0-4.5分：整体表现良好，多数题目回答深入
- 3.0-3.5分：整体表现一般，有亮点但深度不足
- 2.0-2.5分：整体表现偏弱，多数回答缺乏深度
- 1.0-1.5分：整体表现很弱，回答过于简短
- 0分：所有回答均无效

【反馈要求】
- summary：只写简短总评，控制在80个汉字以内
- strengths：2-4个整体优势
- improvements：2-4个整体改进建议
- suggestedScript：给出一个综合性的面试提升建议（200-300字）
- questionAnalyses：覆盖每个有效回答，字段为questionId、score、analysis、strengths、improvements；每题score为1-5分，analysis简明评价本题答案，优点和改进各最多2条

【输出格式】
只输出合法JSON，不要输出Markdown：
{
  "scores": { "专业能力": 3.5, "项目表达": 2.5, "逻辑结构": 3.0, "沟通清晰": 3.5, "岗位动机": 3.0 },
  "summary": "整场面试表现XX。专业能力X分：理由；...",
  "strengths": ["优点1", "优点2"],
  "improvements": ["改进1", "改进2"],
  "suggestedScript": "综合面试提升建议...",
  "questionAnalyses": [
    {
      "questionId": 1,
      "score": 3.5,
      "analysis": "本题回答评价",
      "strengths": ["本题亮点"],
      "improvements": ["本题改进方向"]
    }
  ]
}`;
}

function buildSessionEvaluationUserPrompt(
  qaPairs: InterviewQaPair[],
  features: ResumeFeatures,
  job: JobProfile
): string {
  return JSON.stringify({
    instruction: [
      '请综合所有问题和回答进行整场面试评分，维度评分使用0.5步长。',
      'summary只写80个汉字以内的简短总评。',
      'questionAnalyses必须覆盖每个问题，并使用问题对象中的questionId。',
      '每题分析应直接评价用户答案，优点和改进各最多2条。'
    ],
    qaPairs: qaPairs.map(({ question, answer }) => ({
      question: {
        questionId: question.id,
        text: question.question,
        dimension: question.dimension,
        type: question.type,
        referencePoints: question.referencePoints
      },
      answer
    })),
    context: {
      jobTitle: job.title, jobKeywords: job.keywords, jobRequirements: job.requirements,
      candidateSkills: features.skills.slice(0, 8), candidateProjects: features.projectKeywords.slice(0, 5)
    }
  });
}

// ==================== 综合评分 ====================

export function mergeEvaluations(evaluations: InterviewEvaluation[]): InterviewEvaluation {
  if (!evaluations.length) {
    return {
      scores: Object.fromEntries(INTERVIEW_DIMENSIONS.map(d => [d, 0])) as Record<InterviewDimension, number>,
      totalScore: 0,
      summary: '请至少回答一道题后再生成评分。',
      strengths: [],
      improvements: ['补充面试回答后再提交评分。']
    };
  }

  const scores = Object.fromEntries(INTERVIEW_DIMENSIONS.map(dimension => {
    const avg = evaluations.reduce((sum, item) => sum + item.scores[dimension], 0) / evaluations.length;
    return [dimension, Math.round(avg * 2) / 2];
  })) as Record<InterviewDimension, number>;

  const total = averageScore(scores);
  const invalidCount = evaluations.filter(item => item.totalScore === 0 && item.strengths.length === 0).length;
  const performance = total >= 4
    ? '整体表现良好'
    : total >= 3
      ? '整体表现一般'
      : total >= 2
        ? '整体表现偏弱'
        : '整体有效信息不足';
  const invalidNote = invalidCount ? `，其中 ${invalidCount} 道回答无效并按 0 分计入` : '';

  return {
    scores,
    totalScore: total,
    summary: `综合评分 ${total}/5。${performance}${invalidNote}。建议补充与问题直接相关的经历、行动和结果。`,
    strengths: unique(evaluations.flatMap(item => item.strengths)).slice(0, 4),
    improvements: unique(evaluations.flatMap(item => item.improvements)).slice(0, 4)
  };
}

function getDimensionReason(score: number): string {
  if (score >= 4.5) return '表现优秀';
  if (score >= 4.0) return '表现良好';
  if (score >= 3.5) return '表现较好';
  if (score >= 3.0) return '表现一般，有提升空间';
  if (score >= 2.5) return '表现偏弱';
  if (score >= 2.0) return '较弱，需重点加强';
  if (score >= 1.0) return '很弱，必须大幅改进';
  return '无效回答';
}

function getScoreLevel(score: number): string {
  if (score >= 4.5) return '优秀';
  if (score >= 4.0) return '良好';
  if (score >= 3.5) return '较好';
  if (score >= 3.0) return '一般';
  if (score >= 2.5) return '偏弱';
  if (score >= 2.0) return '待提升';
  if (score >= 1.0) return '需加强';
  return '无效';
}

// ==================== 本地评估兜底 ====================

function fallbackEvaluation(
  question: InterviewQuestion,
  answer: string,
  features: ResumeFeatures,
  job: JobProfile
): InterviewEvaluation {
  const text = answer.trim();
  const validityCheck = checkAnswerValidity(text);
  if (!validityCheck.valid) return validityCheck.evaluation!;

  const length = text.length;

  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  const isPureNumber = /^[\d\s.,，。、+\-*/%=()（）]+$/.test(text);
  const isGarbage = !hasChinese || isPureNumber;

  // 无效输入 → 0分
  if (length < 10 || isGarbage) {
    const zeroScores = Object.fromEntries(INTERVIEW_DIMENSIONS.map(d => [d, 0])) as Record<InterviewDimension, number>;
    return {
      scores: zeroScores, totalScore: 0,
      summary: isGarbage ? '回答内容无效（纯数字或符号），无法评估。请围绕问题给出完整的文字回答。' : '回答过于简短，无法评估。请至少给出50字以上的完整回答。',
      strengths: [],
      improvements: ['请围绕面试问题给出完整的文字回答', '回答应包含具体经历、技术细节或个人见解', '建议回答至少50字以上']
    };
  }

  // 基础分
  const lengthBase = length >= 400 ? 4.5 : length >= 250 ? 4.0 : length >= 150 ? 3.5 : length >= 100 ? 3.0 : length >= 60 ? 2.5 : length >= 30 ? 2.0 : 1.5;

  // 关键词匹配
  const answerLower = text.toLowerCase();
  const allKeywords = [
    ...features.skills, ...features.projectKeywords, ...job.keywords,
    ...job.requirements.flatMap(r => r.split(/[，,、；;]/)).filter(k => k.length >= 2)
  ].map(k => k.toLowerCase());
  const matchedKeywords = allKeywords.filter(k => answerLower.includes(k));
  const keywordBonus = Math.min(matchedKeywords.length * 0.25, 1.5);

  // 结构化
  const hasNumbers = /\d+[%％个万人年月日次项]/.test(text);
  const hasBulletPoints = /[首先其次最后第一第二第三]/.test(text) || /\n[-*•]/.test(text);
  const hasCausalWords = /[因为所以因此导致从而使得]/.test(text);
  const structureBonus = (hasNumbers ? 0.3 : 0) + (hasBulletPoints ? 0.3 : 0) + (hasCausalWords ? 0.2 : 0);

  // 维度相关性
  const dimensionBonus =
    question.dimension === '专业能力' && matchedKeywords.length >= 2 ? 0.3
    : question.dimension === '项目表达' && hasNumbers ? 0.3
    : question.dimension === '逻辑结构' && (hasBulletPoints || hasCausalWords) ? 0.3
    : question.dimension === '沟通清晰' && length >= 80 ? 0.2
    : question.dimension === '岗位动机' && length >= 60 ? 0.2
    : 0;

  // 计算分数
  const scores = Object.fromEntries(INTERVIEW_DIMENSIONS.map(dimension => {
    const isTargetDimension = dimension === question.dimension;
    const rawScore = lengthBase + keywordBonus + structureBonus + dimensionBonus;
    const adjustedScore = isTargetDimension ? rawScore + 0.5 : rawScore * 0.8;
    const rounded = Math.round(adjustedScore * 2) / 2;
    return [dimension, Math.max(1.0, Math.min(5.0, rounded))];
  })) as Record<InterviewDimension, number>;

  const total = averageScore(scores);
  const level = getScoreLevel(total);

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (length >= 150) strengths.push('回答内容较为充实');
  if (matchedKeywords.length >= 2) strengths.push(`回答涉及了 ${matchedKeywords.slice(0, 3).join('、')} 等岗位相关关键词`);
  if (hasNumbers) strengths.push('回答中包含量化数据');
  if (hasBulletPoints) strengths.push('回答结构清晰、有条理');
  if (hasCausalWords) strengths.push('回答有因果逻辑分析');
  if (strengths.length === 0) strengths.push('已完成基本回答');

  if (length < 60) improvements.push('回答过短，建议补充更多细节，至少100字以上');
  if (!hasNumbers) improvements.push('建议补充量化数据（如提升了XX%、处理了XX万条数据）');
  if (!hasBulletPoints && length >= 60) improvements.push('建议使用"首先/其次/最后"等结构化表达');
  if (matchedKeywords.length < 2) improvements.push('建议更明确地对应岗位要求，提及相关技能和经验');
  if (improvements.length === 0) improvements.push('可以进一步深挖项目中的技术细节和决策过程');

  const dimensionReasons = INTERVIEW_DIMENSIONS.map(d => `${d}${scores[d]}分（${getDimensionReason(scores[d])}）`).join('；');

  return {
    scores,
    totalScore: total,
    summary: `本题评分 ${total}/5（${level}）。${dimensionReasons}。当前使用本地规则评分。`,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    suggestedScript: generateSuggestedScript(question, features, job)
  };
}

function buildFallbackQuestionAnalysis(
  { question, answer }: InterviewQaPair,
  features: ResumeFeatures,
  job: JobProfile
): InterviewQuestionAnalysis {
  const validityCheck = checkAnswerValidity(answer.trim());
  const evaluation = fallbackEvaluation(question, answer, features, job);

  if (!validityCheck.valid) {
    return {
      questionId: question.id,
      score: 0,
      analysis: validityCheck.evaluation?.summary || '该回答未提供可评分的信息。',
      strengths: [],
      improvements: evaluation.improvements.slice(0, 2)
    };
  }

  return {
    questionId: question.id,
    score: evaluation.totalScore,
    analysis: answer.trim().length >= 60
      ? '回答能够围绕题目展开，但还可以进一步补充具体背景、行动过程和结果。'
      : '回答已覆盖部分要点，但内容较简略，需要增加与题目和岗位相关的细节。',
    strengths: evaluation.strengths.slice(0, 2),
    improvements: evaluation.improvements.slice(0, 2)
  };
}

function normalizeQuestionAnalyses(
  items: QuestionAnalysisPayload[] | undefined,
  qaPairs: InterviewQaPair[],
  fallback: InterviewQuestionAnalysis[]
): InterviewQuestionAnalysis[] {
  const normalizedItems = Array.isArray(items) ? items : [];
  let validItemIndex = 0;

  return qaPairs.map(({ question, answer }, index) => {
    const localFallback = fallback[index];
    if (!localFallback) return undefined;

    if (!checkAnswerValidity(answer.trim()).valid) {
      return localFallback;
    }

    const item = normalizedItems.find(candidate => Number(candidate.questionId ?? candidate.question_id) === question.id)
      || normalizedItems[validItemIndex];
    validItemIndex += 1;
    if (!item) return localFallback;

    return {
      questionId: question.id,
      score: normalizeQuestionScore(item.score, localFallback.score),
      analysis: typeof item.analysis === 'string' && item.analysis.trim()
        ? item.analysis.trim()
        : localFallback.analysis,
      strengths: normalizeAnalysisList(item.strengths, localFallback.strengths),
      improvements: normalizeAnalysisList(item.improvements, localFallback.improvements)
    };
  }).filter((item): item is InterviewQuestionAnalysis => Boolean(item));
}

function applyInvalidAnswerPenalty(
  scores: Record<InterviewDimension, number>,
  validCount: number,
  totalCount: number
): Record<InterviewDimension, number> {
  if (totalCount <= 0 || validCount >= totalCount) return scores;
  const validRatio = validCount / totalCount;

  return Object.fromEntries(INTERVIEW_DIMENSIONS.map(dimension => [
    dimension,
    Math.round(scores[dimension] * validRatio * 2) / 2
  ])) as Record<InterviewDimension, number>;
}

function normalizeSessionStrengths(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return unique(value.map(item => String(item).trim()).filter(Boolean)).slice(0, 4);
}

function normalizeQuestionScore(value: unknown, fallback: number): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

function normalizeAnalysisList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = unique(value.map(item => String(item).trim())).slice(0, 2);
  return normalized.length ? normalized : fallback;
}

function normalizeSummary(value: unknown, fallback: string): string {
  const summary = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;
}

// ==================== 话术生成 ====================

function generateSuggestedScript(
  question: InterviewQuestion,
  features: ResumeFeatures,
  job: JobProfile
): string {
  const s1 = features.skills[0] || job.keywords[0] || '相关技能';
  const s2 = features.skills[1] || job.keywords[1] || '相关框架';
  const p1 = features.projectKeywords[0] || 'XX项目';
  const p2 = features.projectKeywords[1] || '另一个项目';
  const w1 = features.workKeywords[0] || '工作经历';
  const ind = job.industry || '互联网';
  const dim = question.dimension;
  const type = question.type;

  if (type === 'technical') {
    if (dim === '专业能力') return `在${job.title}岗位上，${s1}是我最核心的技术能力。以「${p1}」项目为例，我曾遇到[具体技术难题]，通过采用[技术方案]解决了该问题，最终将[指标]从[旧值]优化到[新值]，提升了[XX%]。此外，我还熟练掌握了${s2}等工具。`;
    if (dim === '项目表达') return `我参与过「${p1}」项目，该项目旨在[项目目标]。我在其中担任[角色]，负责[核心模块]。最大的技术挑战是[具体困难]，我通过[解决方案]克服了它。最终项目上线后，[成果数据，如系统响应速度提升30%]。`;
    if (dim === '逻辑结构') return `面对线上系统性能瓶颈，我通常采用以下排查思路：首先通过[监控工具]定位瓶颈点；其次分析[具体指标]确定根因；然后制定优化方案如[具体措施]；最后灰度验证并全量上线。以「${p1}」为例，通过这套方法将[指标]从[旧值]降至[新值]。`;
    if (dim === '沟通清晰') return `简单来说，${s1}就像是[生活类比]。它的核心原理是[一句话概括]。在「${p1}」项目中，我们用它来[具体应用]，效果是[量化结果]。`;
  }

  if (type === 'behavioral') {
    if (dim === '项目表达') return `【Situation】在「${p1}」项目中，我们面临[具体背景和挑战]。【Task】我的任务是[具体目标]。【Action】我采取了以下行动：首先[步骤1]，其次[步骤2]，最后[步骤3]。【Result】最终实现了[量化成果]。`;
    if (dim === '沟通清晰') return `在「${p2}」项目中，我曾遇到[具体困难]。当时我主动与[相关人员]沟通，通过[具体措施]来应对。最终[结果]。如果重来一次，我会[改进点]。`;
    if (dim === '逻辑结构') return `在「${w1}」中，当多个任务同时推进时，我使用[方法]确定优先级：紧急重要的事立即处理，重要不紧急的事制定计划推进。通过这种方法，我在[时间]内完成了[X]个任务。`;
    if (dim === '专业能力') return `我主动学习了${s1}，学习路径是：首先通过[资源]建立基础，然后在「${p1}」中实践应用，遇到[具体困难]时通过[解决方法]克服。最终将${s1}成功应用到项目中。`;
    if (dim === '岗位动机') return `我选择${job.title}方向是因为[个人兴趣]。我在「${p1}」项目中积累了[相关经验]，最自豪的成就是[具体成果]。未来我计划在[方向]深耕。`;
  }

  if (type === 'hr') {
    if (dim === '沟通清晰') return `面试官你好，我是[姓名]，有${features.experienceYears}年${job.title}相关经验。我熟练掌握${s1}、${s2}等技术，曾在「${p1}」项目中担任[角色]，取得了[量化成果]。我对${job.title}岗位充满热情。`;
    if (dim === '岗位动机') return `我选择${job.title}岗位是因为[个人兴趣/经验匹配]。我在「${p1}」项目中积累了[相关经验]，这与岗位要求的${job.keywords.slice(0, 3).join('、')}高度契合。未来3-5年计划在[方向]深耕。`;
  }

  if (type === 'business') {
    if (dim === '逻辑结构') return `针对${ind}领域的问题，我会按以下步骤推进：第一步，通过[方法]了解核心痛点；第二步，分析[竞品]的优劣势；第三步，制定MVP方案；第四步，根据反馈快速迭代。`;
    if (dim === '专业能力') return `在${ind}行业，我认为当前最大的趋势是[趋势]。这对${job.title}岗位的影响是[具体影响]。我的应对策略是：持续学习[相关技术]，在「${p1}」中尝试应用。`;
    if (dim === '沟通清晰') return `当业务方提出难以实现的需求时，我会：首先充分理解业务方的真实诉求；其次从技术角度分析可行性，给出[替代方案]；最后与业务方协商，在[核心目标]不变的前提下调整实现方式。`;
    if (dim === '岗位动机') return `以${ind}行业的[产品名]为例，它的核心竞争力是[核心优势]。如果我来改进，会从[方面1]和[方面2]入手，具体措施包括[具体方案]。`;
  }

  return `针对"${question.question.slice(0, 30)}..."这道题，建议从以下角度回答：1. 结合你在「${p1}」中的实际经验；2. 使用STAR法则组织回答；3. 补充量化数据；4. 体现你对${job.title}岗位的理解和匹配度。`;
}

// ==================== 评分工具函数 ====================

function normalizeScores(
  rawScores: Partial<Record<InterviewDimension, number>>,
  fallback: Record<InterviewDimension, number>
): Record<InterviewDimension, number> {
  return Object.fromEntries(INTERVIEW_DIMENSIONS.map(dimension => {
    const value = Number(rawScores[dimension] ?? fallback[dimension]);
    const rounded = Math.round(value * 2) / 2;
    return [dimension, Math.max(0, Math.min(5.0, rounded))];
  })) as Record<InterviewDimension, number>;
}

function averageScore(scores: Record<InterviewDimension, number>): number {
  const total = INTERVIEW_DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension], 0);
  return Math.round((total / INTERVIEW_DIMENSIONS.length) * 10) / 10;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

/** Fisher-Yates 洗牌算法，用于随机化题目形式顺序 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
