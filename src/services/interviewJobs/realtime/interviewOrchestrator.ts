/**
 * 3-5 模拟面试及职位推送组
 * 本文件负责编排实时语音面试会话、工具调用、答题记录和最终结果。
 */

/**
 * 面试编排器
 *
 * 职责：
 * 1. 从简历 + 岗位构造 AI 面试官 prompt
 * 2. 创建 RealtimeClient 并配置 Function Call 工具
 * 3. 监听 functionCall 事件，区分 record_answer / end_interview
 * 4. 上报 function_call_output 让 AI 继续
 * 5. 累积每道题评分
 * 6. 面试结束后返回完整结果（含 5 维评分雷达数据）
 */

import { RealtimeClient } from './realtimeClient';
import { INTERVIEW_TOOLS } from './interviewTools';
import { buildInterviewInstructions, buildGreeting, type InterviewContext } from './interviewPrompt';
import {
  buildZhipuRealtimeWsUrl,
  sanitizeZhipuRealtimeModel,
  useSettingsStore,
} from '@/store';
import type { InterviewDimension, InterviewEvaluation } from '@/types/interviewJobs';
import type { TranscriptSegment } from './realtimeClient';

export type InterviewState =
  | 'idle'           // 未开始
  | 'connecting'     // 连接中
  | 'greeting'       // AI 正在打招呼
  | 'in_question'    // AI 问了某道题,等用户回答
  | 'thinking'       // AI 在等大模型返回（追问决策 / 评分前的等待）
  | 'evaluating'     // AI 正在调 record_answer
  | 'completed'      // AI 调了 end_interview
  | 'error';         // 出错

export interface AnswerRecord {
  questionId: number;
  dimension: InterviewDimension;
  score: number;          // 1-5
  comment: string;
}

export interface InterviewResult {
  /** 每道题的评分（按题号） */
  answers: AnswerRecord[];
  /** 综合评分（5 题平均） */
  overallScore: number;
  /** AI 给的总结 */
  summary: string;
  /** 优势列表 */
  strengths: string[];
  /** 改进建议列表 */
  improvements: string[];
  /** 完整对话记录 */
  transcript: TranscriptSegment[];
  /** 5 维评分（雷达图用，从 answers 聚合） */
  dimensionScores: Record<InterviewDimension, number>;
  /** 面试时间 */
  timestamp: number;
  /** 岗位标题 */
  jobTitle: string;
  /** 候选人目标岗位 */
  candidateTargetPosition: string;
}

export type OrchestratorEventMap = {
  state: InterviewState;
  /** 当前正在进行的题号(1-5) */
  currentQuestion: { questionId: number; dimension: InterviewDimension };
  /** 一道题评分完成 */
  answerRecorded: AnswerRecord;
  /** 面试结束 */
  completed: InterviewResult;
  /** 转写片段 */
  transcript: TranscriptSegment;
  /** 出错 */
  error: { message: string };
};

export class InterviewOrchestrator {
  private context: InterviewContext;
  private client: RealtimeClient | null = null;
  private state: InterviewState = 'idle';
  private answers: AnswerRecord[] = [];
  private transcript: TranscriptSegment[] = [];
  private startedAt = 0;
  private listeners: Map<keyof OrchestratorEventMap, Set<(payload: unknown) => void>> = new Map();
  private clientUnsubs: (() => void)[] = [];

  constructor(context: InterviewContext) {
    this.context = context;
  }

  // === 事件订阅 ===

  on<K extends keyof OrchestratorEventMap>(
    event: K,
    listener: (payload: OrchestratorEventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (p: unknown) => void);
    return () => {
      this.listeners.get(event)?.delete(listener as (p: unknown) => void);
    };
  }

  private emit<K extends keyof OrchestratorEventMap>(event: K, payload: OrchestratorEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        (fn as (p: OrchestratorEventMap[K]) => void)(payload);
      } catch (err) {
        console.error(`[Orchestrator] listener for "${event}" threw:`, err);
      }
    });
  }

  getState(): InterviewState {
    return this.state;
  }

  private setState(s: InterviewState) {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', s);
  }

  // === 生命周期 ===

  async start(): Promise<void> {
    if (this.client) {
      throw new Error('面试已经在进行中');
    }
    const settings = useSettingsStore();
    if (!settings.zhipuApiKey) {
      throw new Error('未配置智谱 API Key');
    }

    this.startedAt = Date.now();
    this.answers = [];
    this.transcript = [];
    this.setState('connecting');

    const wsURL = buildZhipuRealtimeWsUrl(settings.zhipuRealtimeUrl, settings.zhipuApiKey);

    this.client = new RealtimeClient({
      wsURL,
      session: {
        model: sanitizeZhipuRealtimeModel(settings.zhipuModel),
        modalities: ['text', 'audio'],
        voice: settings.zhipuVoice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm',
        input_audio_noise_reduction: { type: 'far_field' },
        // 客户端 VAD 模式（我们自己检测静音）
        turn_detection: null,
        instructions: buildInterviewInstructions(this.context),
        tools: INTERVIEW_TOOLS,
        temperature: 0.5,
        beta_fields: {
          chat_mode: 'audio',
          tts_source: 'e2e',
          greeting_config: {
            enable: true,
            content: buildGreeting(this.context),
          },
        },
      },
    });

    this.attachClientListeners();

    try {
      await this.client.connect();
      // 连接成功 -> AI 主动打招呼
      this.setState('greeting');
    } catch (err) {
      this.setState('error');
      const msg = err instanceof Error ? err.message : String(err);
      this.emit('error', { message: `连接失败:${msg}` });
      throw err;
    }
  }

  async startMic(): Promise<void> {
    if (!this.client) throw new Error('请先点击「开始面试」');
    await this.client.startMic();
    if (this.state === 'greeting') {
      this.setState('in_question');
      this.emit('currentQuestion', { questionId: 1, dimension: '岗位动机' });
    }
  }

  async stopMic(): Promise<void> {
    if (this.client) await this.client.stopMic();
  }

  async stop(): Promise<void> {
    this.detachClientListeners();
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.setState('idle');
  }

  // === Client 事件桥接 ===

  private attachClientListeners() {
    if (!this.client) return;
    this.clientUnsubs.push(
      this.client.on('state', (s) => {
        // 客户端 VAD 触发的 user_speaking / ai_speaking 在 orchestrator 层不直接暴露
        // 但当 AI 进入 ai_speaking 时,我们认为是"AI 正在问下一个问题"
        if (s === 'ai_speaking' && this.state === 'greeting') {
          this.setState('in_question');
        }
        if (s === 'ai_speaking' && this.state === 'in_question') {
          // AI 正在问新题(通过 function call 决定)
          // 这里不修改 currentQuestion,因为可能只是普通对话
        }
      }),
      this.client.on('functionCall', (fc) => {
        this.handleFunctionCall(fc);
      }),
      this.client.on('transcript', (t) => {
        this.transcript.push(t);
        this.emit('transcript', t);
      }),
      this.client.on('error', ({ message }) => {
        this.emit('error', { message });
      })
    );
  }

  private detachClientListeners() {
    this.clientUnsubs.forEach((u) => u());
    this.clientUnsubs = [];
  }

  // === Function Call 处理 ===

  private async handleFunctionCall(fc: { name: string; parsedArgs: Record<string, unknown> | null }) {
    if (!this.client) return;
    const args = fc.parsedArgs ?? {};

    if (fc.name === 'record_answer') {
      const a: AnswerRecord = {
        questionId: Number(args.question_id) || 0,
        dimension: (args.dimension as InterviewDimension) || '专业能力',
        score: Number(args.score) || 3,
        comment: String(args.comment || ''),
      };
      this.answers.push(a);
      this.emit('answerRecorded', a);
      // 上报结果给 AI,让它继续
      this.setState('evaluating');
      this.client.reportFunctionCallOutput('record_answer', { status: 'ok', recorded: true });
      // 假设下一题(除非已到第 5 题)
      if (a.questionId < 5) {
        this.emit('currentQuestion', {
          questionId: a.questionId + 1,
          dimension: this.getDimensionForQuestion(a.questionId + 1),
        });
      }
    } else if (fc.name === 'end_interview') {
      this.setState('completed');
      this.emit('completed', this.buildResult({
        overallScore: Number(args.overall_score) || 0,
        summary: String(args.summary || ''),
        strengths: Array.isArray(args.strengths) ? args.strengths.map(String) : [],
        improvements: Array.isArray(args.improvements) ? args.improvements.map(String) : [],
      }));
      this.client.reportFunctionCallOutput('end_interview', { status: 'ok' });
    }
  }

  private getDimensionForQuestion(qid: number): InterviewDimension {
    const map: InterviewDimension[] = [
      '岗位动机',
      '项目表达',
      '专业能力',
      '逻辑结构',
      '沟通清晰',
    ];
    return map[qid - 1] ?? '专业能力';
  }

  private buildResult(endArgs: {
    overallScore: number;
    summary: string;
    strengths: string[];
    improvements: string[];
  }): InterviewResult {
    // 聚合 5 维评分（从 answers 里取每个维度的平均分）
    const byDimension: Record<InterviewDimension, number[]> = {
      岗位动机: [],
      项目表达: [],
      专业能力: [],
      逻辑结构: [],
      沟通清晰: [],
    };
    this.answers.forEach((a) => {
      if (byDimension[a.dimension]) {
        byDimension[a.dimension].push(a.score);
      }
    });
    const dimensionScores: Record<InterviewDimension, number> = {
      岗位动机: 0,
      项目表达: 0,
      专业能力: 0,
      逻辑结构: 0,
      沟通清晰: 0,
    };
    (Object.keys(byDimension) as InterviewDimension[]).forEach((d) => {
      const arr = byDimension[d];
      if (arr.length) {
        dimensionScores[d] = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
      }
    });

    // 综合分：优先用 end_interview 给的 overall_score,否则用 5 维平均
    const overallScore =
      endArgs.overallScore ||
      Math.round(
        ((dimensionScores.岗位动机 +
          dimensionScores.项目表达 +
          dimensionScores.专业能力 +
          dimensionScores.逻辑结构 +
          dimensionScores.沟通清晰) /
          5) *
          10
      ) / 10;

    return {
      answers: this.answers,
      overallScore,
      summary: endArgs.summary,
      strengths: endArgs.strengths,
      improvements: endArgs.improvements,
      transcript: this.transcript,
      dimensionScores,
      timestamp: this.startedAt,
      jobTitle: this.context.job.title,
      candidateTargetPosition: this.context.candidate.targetPosition,
    };
  }

  /** 客户端 VAD 触发时由外部调用,告诉 orchestrator 用户回答完毕 */
  notifyUserAnswerSubmitted() {
    // 由 RealtimeClient 内部处理,这里只用来打点
  }

  /** 转成 InterviewEvaluation 给现有 UI 组件复用(雷达图等) */
  toInterviewEvaluation(result: InterviewResult): InterviewEvaluation {
    return {
      scores: result.dimensionScores,
      totalScore: result.overallScore,
      summary: result.summary,
      strengths: result.strengths,
      improvements: result.improvements,
    };
  }
}
