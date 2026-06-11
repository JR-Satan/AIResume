/**
 * 3-5 模拟面试及职位推送组
 * 本文件串联基础语音面试的出题、识别、追问、评分和结果生成流程。
 */

import {
  createVoiceRecognizer,
  getVoiceInterviewCapability,
  stopInterviewSpeech,
} from '@/services/interviewJobs/voiceInterview';
import {
  evaluateInterviewAnswer,
  evaluateInterviewSession,
  generateInterviewQuestions,
} from '@/services/interviewJobs/interviewService';
import { callInterviewLlmForJson } from '@/services/interviewJobs/llmClient';
import type {
  InterviewDimension,
  InterviewEvaluation,
  InterviewQuestion,
} from '@/types/interviewJobs';
import { buildGreeting, type InterviewContext } from '@/services/interviewJobs/realtime/interviewPrompt';
import type {
  AnswerRecord,
  InterviewResult,
  InterviewState,
  OrchestratorEventMap,
} from '@/services/interviewJobs/realtime/interviewOrchestrator';
import type { TranscriptSegment } from '@/services/interviewJobs/realtime/realtimeClient';
import { useSettingsStore } from '@/store';

type VoiceRecognizer = NonNullable<ReturnType<typeof createVoiceRecognizer>>;

interface QaRecord {
  question: InterviewQuestion;
  answer: string;
}

interface FollowUpDecision {
  shouldAskFollowUp: boolean;
  followUpQuestion?: string;
  reason?: string;
  focusKey?: string;
  evaluation?: InterviewEvaluation;
}

interface HeuristicFollowUp {
  focusKey: string;
  question: string;
}

export class BasicInterviewOrchestrator {
  private readonly context: InterviewContext;
  private readonly listeners: Map<keyof OrchestratorEventMap, Set<(payload: unknown) => void>> = new Map();
  private readonly maxFollowUpsPerQuestion = 2;

  private state: InterviewState = 'idle';
  private startedAt = 0;
  private questions: InterviewQuestion[] = [];
  private answers: AnswerRecord[] = [];
  private transcript: TranscriptSegment[] = [];
  private qaRecords: QaRecord[] = [];
  private currentQuestionIndex = 0;

  private recognizer: VoiceRecognizer | null = null;
  private recognitionActive = false;
  private shouldKeepListening = false;
  private pendingStopResolve: (() => void) | null = null;
  private answerParts: string[] = [];
  // 每个 result slot 的最新 interim 文本。Chrome 在静音超时 / 用户主动 stop 时
  // 可能不补发对应 utterance 的 isFinal=true，导致这部分文本永远进不了 answerParts。
  // 这里先存住，onend / 重启 / stopMic 时统一 flush 进去，避免长回答被截断成一两句。
  private interimByIndex: Map<number, string> = new Map();
  private restartTimer: number | null = null;
  private currentQuestionTurns: string[] = [];
  private currentQuestionFollowUpCount = 0;
  private currentQuestionAskedFocuses = new Set<string>();

  constructor(context: InterviewContext) {
    this.context = context;
  }

  on<K extends keyof OrchestratorEventMap>(
    event: K,
    listener: (payload: OrchestratorEventMap[K]) => void,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (payload: unknown) => void);

    return () => {
      this.listeners.get(event)?.delete(listener as (payload: unknown) => void);
    };
  }

  private emit<K extends keyof OrchestratorEventMap>(event: K, payload: OrchestratorEventMap[K]) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        (listener as (value: OrchestratorEventMap[K]) => void)(payload);
      } catch (error) {
        console.error(`[BasicInterviewOrchestrator] listener for "${event}" failed`, error);
      }
    });
  }

  getState(): InterviewState {
    return this.state;
  }

  private setState(nextState: InterviewState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this.emit('state', nextState);
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('面试已经在进行中');
    }

    const capability = getVoiceInterviewCapability();
    if (!capability.speechRecognition) {
      throw new Error('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
    }
    if (!capability.speechSynthesis) {
      throw new Error('当前浏览器不支持语音播报，请切换到支持语音合成的浏览器');
    }

    this.resetSessionData();
    this.startedAt = Date.now();
    this.setState('connecting');

    this.questions = await generateInterviewQuestions(this.context.candidate, this.context.job, 5);
    if (!this.questions.length) {
      throw new Error('面试题生成失败，请检查通用 LLM 配置');
    }

    this.currentQuestionIndex = 0;
    this.emitCurrentQuestion();
    this.setState('greeting');

    const firstQuestion = this.questions[0];
    const opening = `${buildGreeting(this.context)} ${firstQuestion.question}`;
    await this.narrateAssistant(opening);

    this.setState('in_question');
  }

  async startMic(): Promise<void> {
    if (this.state !== 'in_question') {
      throw new Error('当前还不能开始作答');
    }

    if (!this.recognizer) {
      this.recognizer = this.createRecognizer();
    }

    if (this.recognitionActive) return;

    this.answerParts = [];
    this.interimByIndex.clear();
    this.shouldKeepListening = true;
    this.recognitionActive = true;

    try {
      this.recognizer.start();
    } catch (error) {
      this.recognitionActive = false;
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async stopMic(): Promise<void> {
    if (!this.recognizer || !this.recognitionActive) return;

    this.shouldKeepListening = false;
    this.clearPendingRestart();
    await new Promise<void>((resolve) => {
      this.pendingStopResolve = resolve;
      this.recognizer?.stop();
    });

    this.recognitionActive = false;
    // 兜底：onend 时已经 flush 过；这里再 flush 一次防 Chromium 不补发 isFinal 的 utterance。
    this.flushInterimToAnswer();
    await this.submitCurrentAnswer();
  }

  async stop(): Promise<void> {
    this.shouldKeepListening = false;
    this.clearPendingRestart();
    this.pendingStopResolve?.();
    this.pendingStopResolve = null;
    this.interimByIndex.clear();

    if (this.recognizer) {
      try {
        this.recognizer.abort();
      } catch {
        // ignore browser-specific abort errors
      }
    }

    stopInterviewSpeech();
    this.recognizer = null;
    this.recognitionActive = false;
    this.setState('idle');
  }

  private resetSessionData() {
    this.questions = [];
    this.answers = [];
    this.transcript = [];
    this.qaRecords = [];
    this.currentQuestionIndex = 0;
    this.recognitionActive = false;
    this.shouldKeepListening = false;
    this.pendingStopResolve = null;
    this.interimByIndex.clear();
    this.clearPendingRestart();
    this.resetCurrentQuestionProgress();
  }

  private resetCurrentQuestionProgress() {
    this.answerParts = [];
    this.currentQuestionTurns = [];
    this.currentQuestionFollowUpCount = 0;
    this.currentQuestionAskedFocuses.clear();
  }

  private createRecognizer(): VoiceRecognizer {
    const recognizer = createVoiceRecognizer({
      lang: 'zh-CN',
      continuous: true,
      interimResults: true,
    });

    if (!recognizer) {
      throw new Error('当前浏览器不支持语音识别');
    }

    recognizer.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        const cleaned = this.normalizeText(transcript);
        if (!cleaned) continue;

        if (result.isFinal) {
          // 终态 → 落账，并清掉这个 slot 的 interim 缓存避免重复。
          this.answerParts.push(cleaned);
          this.interimByIndex.delete(index);
        } else {
          // 非终态 → 暂存最新 interim，等 isFinal 时挪进 answerParts；
          // 如果 Chrome 不补发 isFinal（静音超时 / 主动 stop / 异常 onend），
          // flushInterimToAnswer() 会兜底把这部分捞回去。
          this.interimByIndex.set(index, cleaned);
        }
      }
    };

    recognizer.onerror = (event) => {
      const code = event.error || 'UNKNOWN_ERROR';
      // 静音引发的 no-speech 和重启时的 aborted 是预期情况，让 onend 处理重启逻辑，不打扰用户。
      if (code === 'no-speech' || code === 'aborted') return;
      this.emit('error', { message: this.mapRecognitionError(code) });
    };

    recognizer.onend = () => {
      this.recognitionActive = false;
      // 不管是用户主动 stop、静音超时、还是其它原因，先把这次会话里残留的 interim 文本落账。
      // 否则在 Chrome 不补发 isFinal=true 的情况下，最后一句话会被直接丢掉。
      this.flushInterimToAnswer();

      if (this.pendingStopResolve) {
        const resolve = this.pendingStopResolve;
        this.pendingStopResolve = null;
        resolve();
        return;
      }

      if (this.shouldKeepListening && this.state === 'in_question') {
        this.scheduleRestart(recognizer);
      }
    };

    return recognizer;
  }

  /**
   * 把所有 result slot 的最新 interim 文本落进 answerParts。
   * 调用时机：onend 开头、stopMic 兜底、scheduleRestart 之前。
   * 调用后清空 interimByIndex，避免重复累计。
   */
  private flushInterimToAnswer() {
    if (this.interimByIndex.size === 0) return;
    const ordered = Array.from(this.interimByIndex.entries())
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value)
      .filter(Boolean);
    for (const value of ordered) {
      this.answerParts.push(value);
    }
    this.interimByIndex.clear();
  }

  /**
   * 延迟重启识别。Chrome 在 onend 后立刻 start() 经常抛 InvalidStateError
   * （上一个会话还没完全释放），所以隔 250ms 再启；首次失败再退避 500ms 重试一次。
   * 两次都失败就明确告诉用户：把麦克风关掉再点开始作答。
   */
  private scheduleRestart(recognizer: VoiceRecognizer, attempt = 0) {
    this.clearPendingRestart();
    const delay = attempt === 0 ? 250 : 500;
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (!this.shouldKeepListening || this.state !== 'in_question') return;
      try {
        recognizer.start();
        this.recognitionActive = true;
      } catch (error) {
        if (attempt < 1) {
          this.scheduleRestart(recognizer, attempt + 1);
          return;
        }
        // 彻底失败：复位状态，让 UI 显示麦克风已关，并明确告知用户。
        this.shouldKeepListening = false;
        this.recognitionActive = false;
        const detail = error instanceof Error ? error.message : String(error);
        this.emit('error', {
          message: `语音识别中断（${detail || '未知原因'}），请点击麦克风按钮重新作答`,
        });
      }
    }, delay);
  }

  private clearPendingRestart() {
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private async submitCurrentAnswer(): Promise<void> {
    const question = this.questions[this.currentQuestionIndex];
    const answer = this.normalizeText(this.answerParts.join(' '));
    this.answerParts = [];

    if (!question) {
      this.emit('error', { message: '当前题目不存在，请重新开始面试' });
      return;
    }

    if (!answer) {
      this.emit('error', { message: '没有识别到有效回答，请重新作答' });
      this.setState('in_question');
      return;
    }

    this.pushTranscript('user', answer);
    this.currentQuestionTurns.push(answer);
    // 等大模型决定是否追问 / 跑评分前先切到 thinking 状态，
    // 让 UI 上的 AI 头像变成「思考中」动画，避免长时间卡在「正在提问 / 倾听」让人以为系统死了。
    this.setState('thinking');

    const combinedAnswer = this.composeCombinedAnswer();
    const followUpDecision = await this.buildFollowUpDecision(question, combinedAnswer, answer);

    if (followUpDecision.shouldAskFollowUp && followUpDecision.followUpQuestion) {
      this.currentQuestionFollowUpCount += 1;
      if (followUpDecision.focusKey) {
        this.currentQuestionAskedFocuses.add(followUpDecision.focusKey);
      }
      await this.narrateAssistant(followUpDecision.followUpQuestion);
      this.setState('in_question');
      return;
    }

    const finalAnswer = this.composeStructuredAnswer();
    this.qaRecords.push({ question, answer: finalAnswer });
    this.setState('evaluating');

    const evaluation = followUpDecision.evaluation
      ?? await evaluateInterviewAnswer(
        question,
        finalAnswer,
        this.context.candidate,
        this.context.job,
      );

    const score = evaluation.scores[question.dimension] ?? evaluation.totalScore;
    const answerRecord: AnswerRecord = {
      questionId: question.id,
      dimension: question.dimension,
      score,
      comment: this.buildShortComment(evaluation.summary, evaluation.strengths),
    };

    this.answers.push(answerRecord);
    this.emit('answerRecorded', answerRecord);
    this.resetCurrentQuestionProgress();

    if (this.currentQuestionIndex >= this.questions.length - 1) {
      await this.finishInterview();
      return;
    }

    this.currentQuestionIndex += 1;
    this.emitCurrentQuestion();

    const nextQuestion = this.questions[this.currentQuestionIndex];
    await this.narrateAssistant(`收到，我们继续下一题。${nextQuestion.question}`);
    this.setState('in_question');
  }

  private async finishInterview(): Promise<void> {
    const summaryEvaluation = await evaluateInterviewSession(
      this.qaRecords,
      this.context.candidate,
      this.context.job,
    );

    await this.narrateAssistant('好的，今天的模拟面试到这里。稍后我会给出本次面试报告。');
    this.setState('completed');
    this.emit('completed', this.buildResult(summaryEvaluation));
  }

  private buildResult(evaluation: {
    scores: Record<InterviewDimension, number>;
    totalScore: number;
    summary: string;
    strengths: string[];
    improvements: string[];
  }): InterviewResult {
    return {
      answers: this.answers,
      overallScore: evaluation.totalScore,
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      transcript: this.transcript,
      dimensionScores: evaluation.scores,
      timestamp: this.startedAt,
      jobTitle: this.context.job.title,
      candidateTargetPosition: this.context.candidate.targetPosition,
    };
  }

  private emitCurrentQuestion() {
    const question = this.questions[this.currentQuestionIndex];
    if (!question) return;
    this.emit('currentQuestion', {
      questionId: question.id,
      dimension: question.dimension,
    });
  }

  private async narrateAssistant(text: string): Promise<void> {
    const cleaned = this.normalizeText(text);
    if (!cleaned) return;

    this.pushTranscript('assistant', cleaned);

    await new Promise<void>((resolve) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = 'zh-CN';
      utterance.rate = useSettingsStore().basicSpeechRate;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  private pushTranscript(role: 'user' | 'assistant', text: string) {
    const segment: TranscriptSegment = {
      role,
      text,
      timestamp: Date.now(),
    };
    this.transcript.push(segment);
    this.emit('transcript', segment);
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private composeCombinedAnswer(): string {
    return this.currentQuestionTurns.join('\n');
  }

  private composeStructuredAnswer(): string {
    return this.currentQuestionTurns
      .map((turn, index) => (index === 0 ? `主回答：${turn}` : `补充回答${index}：${turn}`))
      .join('\n');
  }

  private buildShortComment(summary: string, strengths: string[]): string {
    const source = strengths[0] || summary || '回答完成';
    return source.replace(/\s+/g, ' ').slice(0, 30);
  }

  private async buildFollowUpDecision(
    question: InterviewQuestion,
    combinedAnswer: string,
    latestAnswer: string,
  ): Promise<FollowUpDecision> {
    if (this.currentQuestionFollowUpCount >= this.maxFollowUpsPerQuestion) {
      const evaluation = await evaluateInterviewAnswer(
        question,
        this.composeStructuredAnswer(),
        this.context.candidate,
        this.context.job,
      );
      return { shouldAskFollowUp: false, evaluation };
    }

    const quickEvaluation = await evaluateInterviewAnswer(
      question,
      this.composeStructuredAnswer(),
      this.context.candidate,
      this.context.job,
    );

    if (quickEvaluation.totalScore >= 4 && combinedAnswer.length >= 140) {
      return {
        shouldAskFollowUp: false,
        evaluation: quickEvaluation,
      };
    }

    const llmDecision = await this.generateFollowUpFromLlm(
      question,
      combinedAnswer,
      latestAnswer,
      quickEvaluation,
    );
    if (llmDecision?.shouldAskFollowUp && llmDecision.followUpQuestion) {
      const focusKey = llmDecision.focusKey || this.inferFocusKeyFromText(llmDecision.followUpQuestion);
      if (!this.currentQuestionAskedFocuses.has(focusKey)) {
        return {
          ...llmDecision,
          focusKey,
        };
      }
    }

    const heuristicFollowUp = this.buildHeuristicFollowUp(
      question,
      combinedAnswer,
      latestAnswer,
      quickEvaluation,
    );

    if (heuristicFollowUp) {
      return {
        shouldAskFollowUp: true,
        followUpQuestion: heuristicFollowUp.question,
        focusKey: heuristicFollowUp.focusKey,
        reason: 'heuristic_follow_up',
      };
    }

    return {
      shouldAskFollowUp: false,
      evaluation: quickEvaluation,
    };
  }

  private async generateFollowUpFromLlm(
    question: InterviewQuestion,
    combinedAnswer: string,
    latestAnswer: string,
    evaluation: InterviewEvaluation,
  ): Promise<FollowUpDecision | null> {
    const remainingFollowUps = this.maxFollowUpsPerQuestion - this.currentQuestionFollowUpCount;
    const response = await callInterviewLlmForJson<FollowUpDecision>({
      temperature: 0.45,
      systemPrompt: [
        '你是一位中文模拟面试官。',
        '请根据候选人的当前回答，判断是否还需要继续追问当前这道题。',
        '只有当回答缺少具体场景、本人职责、关键判断、技术细节、结果数据、复盘，或表达过于空泛时，才继续追问。',
        '如果追问，必须只追一个点，短而具体，像真实面试官，不能突然换题。',
        `当前这道题最多还可以追问 ${remainingFollowUps} 次。`,
        'focusKey 只能从这些值里选一个：example, role, action, reasoning, result, metrics, structure, tech_detail, motivation_fit, reflection, audience。',
        '如果信息已经足够完整，返回 shouldAskFollowUp=false。',
        '只输出合法 JSON。',
      ].join('\n'),
      userPrompt: JSON.stringify({
        jobTitle: this.context.job.title,
        question: question.question,
        dimension: question.dimension,
        referencePoints: question.referencePoints,
        latestAnswer,
        combinedAnswer,
        followUpCount: this.currentQuestionFollowUpCount,
        askedFocuses: Array.from(this.currentQuestionAskedFocuses),
        evaluationSummary: evaluation.summary,
        score: evaluation.totalScore,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        outputSchema: {
          shouldAskFollowUp: 'boolean',
          followUpQuestion: 'string',
          reason: 'string',
          focusKey: 'string',
        },
      }),
    });

    if (!response.success || !response.data) return null;

    const followUpQuestion = this.normalizeText(response.data.followUpQuestion || '');
    return {
      shouldAskFollowUp: Boolean(response.data.shouldAskFollowUp && followUpQuestion),
      followUpQuestion,
      reason: response.data.reason,
      focusKey: response.data.focusKey,
    };
  }

  private buildHeuristicFollowUp(
    question: InterviewQuestion,
    combinedAnswer: string,
    latestAnswer: string,
    evaluation: InterviewEvaluation,
  ): HeuristicFollowUp | null {
    const priorities = this.identifyMissingFocuses(question, combinedAnswer, latestAnswer, evaluation);
    const focusKey = priorities.find((item) => !this.currentQuestionAskedFocuses.has(item));
    if (!focusKey) return null;

    const anchor = this.pickAnchorPhrase(question);

    const followUpByFocus: Record<string, string> = {
      example: '你先别泛泛而谈。请直接讲一个你亲身经历过的具体场景，最好按当时背景、你的动作、最后结果来讲。',
      role: '这个例子里你本人具体负责哪一段？哪些动作是你亲自做的，而不是团队一起完成的？',
      action: '继续往下讲执行层面：你当时具体做了哪些动作，按顺序展开说一下。',
      reasoning: `围绕「${anchor}」这个点，再讲清楚一点：你当时为什么这么判断，取舍依据是什么？`,
      result: '你的回答还缺结果。最后事情落成了什么状态，对业务、效率或质量产生了什么影响？',
      metrics: '结果尽量量化一点。至少补一个指标变化，比如效率、成功率、时延、成本或产出变化。',
      structure: '请你按“背景、判断、动作、结果”这个顺序重新讲一遍，尽量更有条理一些。',
      tech_detail: `你刚才提到了「${anchor}」，继续往下讲一层：关键实现细节或技术难点是什么，你是怎么处理的？`,
      motivation_fit: `请别只说想做这类工作。具体讲讲为什么是「${this.context.job.title}」这个岗位，以及你过去哪段经历最能证明匹配。`,
      reflection: '如果这件事再来一次，你会怎么优化？请补一个复盘或改进点。',
      audience: '如果现在要讲给不懂技术的同事听，你会怎么解释？尽量说得更直白一些。',
    };

    return {
      focusKey,
      question: followUpByFocus[focusKey] || '请补一个更具体的例子，重点讲你的判断、动作和结果。',
    };
  }

  private identifyMissingFocuses(
    question: InterviewQuestion,
    combinedAnswer: string,
    latestAnswer: string,
    evaluation: InterviewEvaluation,
  ): string[] {
    const text = `${combinedAnswer}\n${latestAnswer}`;
    const improvements = evaluation.improvements ?? [];
    const priorities: string[] = [];

    const hasExample = /(项目|经历|场景|案例|当时|有一次|之前|曾经|负责过)/.test(text);
    const hasRole = /(我负责|我主导|我参与|我推进|我设计|我实现|我协调|我排查|我落地)/.test(text);
    const hasAction = /(先|然后|接着|最后|排查|实现|设计|优化|协调|推进|分析|验证|拆分|沟通)/.test(text);
    const hasReasoning = /(因为|所以|考虑到|判断|取舍|权衡|原因|目标|风险)/.test(text);
    const hasResult = /(结果|最终|上线|提升|降低|完成|达成|增长|节省|产出|效果|改善)/.test(text);
    const hasMetrics = /\d+(\.\d+)?\s*(%|倍|个|天|周|月|年|ms|秒|万|千|人|条|次)/i.test(text);
    const hasReflection = /(复盘|如果再来一次|改进|优化空间|总结|反思)/.test(text);
    const hasAudienceTone = /(简单说|通俗|可以理解为|相当于|打个比方|比如)/.test(text);
    const hasStructure = /(首先|其次|然后|最后|第一|第二|第三)/.test(text);

    const jobAnchorPresent = this.context.job.keywords.some((keyword) => keyword && text.includes(keyword));
    const referenceAnchorPresent = (question.referencePoints || []).some((point) => point && text.includes(point));
    const hasAnchor = jobAnchorPresent || referenceAnchorPresent;

    if (improvements.some((item) => /量化|数据|指标/.test(item))) priorities.push('metrics');
    if (improvements.some((item) => /结构|条理|首先|其次|最后/.test(item))) priorities.push('structure');
    if (improvements.some((item) => /岗位|匹配|动机|规划/.test(item))) priorities.push('motivation_fit');

    switch (question.dimension) {
      case '专业能力':
        if (!hasExample) priorities.push('example');
        if (!hasAnchor) priorities.push('tech_detail');
        if (!hasReasoning) priorities.push('reasoning');
        if (!hasResult) priorities.push('result');
        if (!hasMetrics) priorities.push('metrics');
        break;
      case '项目表达':
        if (!hasExample) priorities.push('example');
        if (!hasRole) priorities.push('role');
        if (!hasAction) priorities.push('action');
        if (!hasResult) priorities.push('result');
        if (!hasMetrics) priorities.push('metrics');
        if (!hasReflection && this.currentQuestionFollowUpCount > 0) priorities.push('reflection');
        break;
      case '逻辑结构':
        if (!hasStructure) priorities.push('structure');
        if (!hasReasoning) priorities.push('reasoning');
        if (!hasAction) priorities.push('action');
        if (!hasResult) priorities.push('result');
        break;
      case '沟通清晰':
        if (!hasAudienceTone) priorities.push('audience');
        if (!hasExample) priorities.push('example');
        if (!hasStructure) priorities.push('structure');
        break;
      case '岗位动机':
        if (!jobAnchorPresent) priorities.push('motivation_fit');
        if (!hasExample) priorities.push('example');
        if (!hasReasoning) priorities.push('reasoning');
        if (!hasResult && this.currentQuestionFollowUpCount > 0) priorities.push('result');
        break;
      default:
        if (!hasExample) priorities.push('example');
        if (!hasResult) priorities.push('result');
        break;
    }

    if (latestAnswer.length < 24) priorities.unshift('example');
    if (combinedAnswer.length < 80) priorities.push('action');

    return Array.from(new Set(priorities));
  }

  private pickAnchorPhrase(question: InterviewQuestion): string {
    const fromReference = (question.referencePoints || []).find((item) => item && item.trim().length >= 2);
    if (fromReference) return fromReference;

    const fromKeyword = this.context.job.keywords.find((item) => item && question.question.includes(item));
    if (fromKeyword) return fromKeyword;

    return question.dimension;
  }

  private inferFocusKeyFromText(text: string): string {
    if (/量化|指标|数据/.test(text)) return 'metrics';
    if (/负责|亲自/.test(text)) return 'role';
    if (/为什么|判断|取舍/.test(text)) return 'reasoning';
    if (/结果|效果|影响/.test(text)) return 'result';
    if (/复盘|改进/.test(text)) return 'reflection';
    if (/技术|实现|难点/.test(text)) return 'tech_detail';
    if (/岗位|匹配|动机/.test(text)) return 'motivation_fit';
    if (/顺序|条理|背景/.test(text)) return 'structure';
    if (/不懂技术|直白/.test(text)) return 'audience';
    if (/例子|场景|经历|案例/.test(text)) return 'example';
    return `follow_up_${this.currentQuestionFollowUpCount + 1}`;
  }

  private mapRecognitionError(error: string): string {
    const errorMap: Record<string, string> = {
      'audio-capture': '没有检测到可用麦克风',
      'not-allowed': '麦克风权限被拒绝，请允许浏览器访问麦克风',
      'service-not-allowed': '浏览器禁止了语音识别服务',
      aborted: '语音识别已中断，请重新开始作答',
      network: '语音识别网络异常，请稍后再试',
      'no-speech': '没有检测到讲话，请重新作答',
    };

    return errorMap[error] || `语音识别失败: ${error}`;
  }
}
