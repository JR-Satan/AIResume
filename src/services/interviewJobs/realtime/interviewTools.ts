/**
 * 面试 Function Call 工具定义
 *
 * 智谱 GLM-Realtime 的 tools 字段（session.update 时传入），
 * AI 在面试过程中会"自主决定"什么时候调这些工具。
 *
 * JSON Schema 语法参考 OpenAI Function Calling 规范。
 */

import type { RealtimeTool } from './types';

export const RECORD_ANSWER_TOOL: RealtimeTool = {
  type: 'function',
  name: 'record_answer',
  description:
    '当候选人完成一道题的回答后，调用此工具记录评分。每道题回答完毕必须立即调用一次。',
  parameters: {
    type: 'object',
    properties: {
      question_id: {
        type: 'number',
        description: '题号，1-5',
        minimum: 1,
        maximum: 5,
      },
      dimension: {
        type: 'string',
        enum: ['岗位动机', '项目表达', '专业能力', '逻辑结构', '沟通清晰'],
        description: '该题考察的维度，必须与提问时的维度一致',
      },
      score: {
        type: 'integer',
        description: '1-5 分。1=很差，2=较差，3=一般，4=较好，5=优秀',
        minimum: 1,
        maximum: 5,
      },
      comment: {
        type: 'string',
        description: '简短的评语，不超过 30 字，给出关键优缺点',
      },
    },
    required: ['question_id', 'dimension', 'score', 'comment'],
  },
};

export const END_INTERVIEW_TOOL: RealtimeTool = {
  type: 'function',
  name: 'end_interview',
  description:
    '当 5 道题全部面试完毕、每道题的评分都已记录后，调用此工具结束面试并给出最终评估。',
  parameters: {
    type: 'object',
    properties: {
      overall_score: {
        type: 'number',
        description: '综合评分 1-5（5 道题得分的平均，保留 1 位小数）',
        minimum: 1,
        maximum: 5,
      },
      summary: {
        type: 'string',
        description: '面试总结，不超过 150 字',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: '候选人 3-5 条主要优势',
      },
      improvements: {
        type: 'array',
        items: { type: 'string' },
        description: '候选人 3-5 条需要改进的地方',
      },
    },
    required: ['overall_score', 'summary', 'strengths', 'improvements'],
  },
};

export const INTERVIEW_TOOLS: RealtimeTool[] = [
  RECORD_ANSWER_TOOL,
  END_INTERVIEW_TOOL,
];
