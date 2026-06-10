import type { JobProfile, JobRecommendation, ResumeFeatures } from '@/types/interviewJobs';
import { JOB_DATABASE } from './jobDatabase';
import { callInterviewLlmForJson } from './llmClient';

interface JobRecommendationPayload {
  recommendations?: Array<{
    jobId?: string;
    job_id?: string;
    score?: number;
    matchedKeywords?: string[];
    matched_keywords?: string[];
    missingKeywords?: string[];
    missing_keywords?: string[];
    reason?: string;
  }>;
}

export function recommendJobs(features: ResumeFeatures, jobs: JobProfile[] = JOB_DATABASE, topK = 5): JobRecommendation[] {
  return jobs
    .map(job => matchJob(features, job))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export async function recommendJobsWithLlm(
  features: ResumeFeatures,
  jobs: JobProfile[] = JOB_DATABASE,
  topK = 5,
  onLlmError?: (error: string) => void
): Promise<JobRecommendation[]> {
  const fallback = recommendJobs(features, jobs, topK);
  const response = await callInterviewLlmForJson<JobRecommendationPayload>({
    systemPrompt: 'You are a Chinese career consultant. Rank suitable jobs based on resume features and explain the match.',
    userPrompt: JSON.stringify({
      instruction: [
        'Rank candidate jobs for the resume.',
        'Return JSON only.',
        'Only choose jobId values from the provided jobs.',
        'Fields: recommendations/jobId/score/matchedKeywords/missingKeywords/reason.',
        'Score must be an integer from 0 to 100. Reasons should be concise Chinese sentences.',
      ],
      features,
      jobs,
      topK,
    }),
    temperature: 0.15,
  });

  const recommendations = response.data?.recommendations
    ?.map(item => normalizeLlmRecommendation(item, jobs, features))
    .filter((item): item is JobRecommendation => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  if (!recommendations?.length) {
    onLlmError?.(response.error || 'INVALID_RECOMMENDATION_RESPONSE');
    return fallback;
  }

  return recommendations;
}

export function matchJob(features: ResumeFeatures, job: JobProfile): JobRecommendation {
  const featureText = [
    features.targetPosition,
    features.educationLevel,
    ...features.majors,
    ...features.skills,
    ...features.projectKeywords,
    ...features.workKeywords,
    features.rawText,
  ].join(' ').toLowerCase();

  const matchedKeywords = job.keywords.filter(keyword => featureText.includes(keyword.toLowerCase()));
  const missingKeywords = job.keywords.filter(keyword => !matchedKeywords.includes(keyword)).slice(0, 5);
  const keywordCoverage = matchedKeywords.length / Math.max(job.keywords.length, 1);
  const targetBonus = features.targetPosition && job.title.includes(features.targetPosition) ? 0.12 : 0;
  const educationBonus = ['本科', '硕士', '博士'].includes(features.educationLevel) ? 0.08 : 0;
  const projectBonus = Math.min(features.projectKeywords.length * 0.01, 0.1);
  const experienceBonus = Math.min(features.experienceYears * 0.03, 0.1);
  const score = Math.min(100, Math.round((keywordCoverage * 0.7 + targetBonus + educationBonus + projectBonus + experienceBonus) * 100));

  return {
    job,
    score,
    matchedKeywords,
    missingKeywords,
    reason: buildReason(job, score, matchedKeywords, missingKeywords),
  };
}

function normalizeLlmRecommendation(
  item: NonNullable<JobRecommendationPayload['recommendations']>[number],
  jobs: JobProfile[],
  features: ResumeFeatures
): JobRecommendation | undefined {
  const jobId = item.jobId || item.job_id;
  const job = jobs.find(candidate => candidate.id === jobId);
  if (!job) return undefined;

  const fallback = matchJob(features, job);
  return {
    job,
    score: normalizeScore(item.score, fallback.score),
    matchedKeywords: normalizeList(item.matchedKeywords || item.matched_keywords, fallback.matchedKeywords),
    missingKeywords: normalizeList(item.missingKeywords || item.missing_keywords, fallback.missingKeywords),
    reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : fallback.reason,
  };
}

function buildReason(job: JobProfile, score: number, matched: string[], missing: string[]): string {
  const hitText = matched.length ? matched.slice(0, 6).join('、') : '暂无明显岗位关键词';
  const missingText = missing.length ? `建议补强 ${missing.join('、')}` : '岗位核心关键词覆盖较完整';
  return `匹配度 ${score}%。简历特征命中 ${hitText}，与「${job.title}」的能力要求相关，${missingText}。`;
}

function normalizeScore(value: unknown, fallback: number): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean)));
  return normalized.length ? normalized.slice(0, 8) : fallback;
}
