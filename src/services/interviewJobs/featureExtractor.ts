import type { ResumeContentSnapshot } from '@/types/resume';
import type { ResumeFeatures } from '@/types/interviewJobs';
import { callInterviewLlmForJson } from './llmClient';

const SKILL_ALIASES: Record<string, string[]> = {
  Python: ['python', 'py'],
  Java: ['java'],
  SQL: ['sql', 'mysql', 'postgresql', 'sqlite'],
  Redis: ['redis'],
  Docker: ['docker'],
  Linux: ['linux'],
  FastAPI: ['fastapi'],
  Django: ['django'],
  Flask: ['flask'],
  Pandas: ['pandas'],
  PyTorch: ['pytorch', 'torch'],
  TensorFlow: ['tensorflow'],
  Vue: ['vue'],
  React: ['react'],
  TypeScript: ['typescript', 'ts'],
  JavaScript: ['javascript', 'js'],
  机器学习: ['机器学习', 'machine learning'],
  深度学习: ['深度学习', 'deep learning'],
  数据分析: ['数据分析'],
  数据可视化: ['数据可视化', 'tableau', 'powerbi'],
  需求分析: ['需求分析'],
  原型设计: ['原型', 'axure', '墨刀'],
  自动化测试: ['自动化测试', 'selenium', 'pytest'],
  接口测试: ['接口测试', 'postman'],
};

interface ResumeFeaturesPayload {
  targetPosition?: string;
  educationLevel?: string;
  majors?: string[];
  skills?: string[];
  projectKeywords?: string[];
  project_keywords?: string[];
  workKeywords?: string[];
  work_keywords?: string[];
  experienceYears?: number;
  experience_years?: number;
  honors?: string[];
}

export function extractResumeFeatures(snapshot: ResumeContentSnapshot): ResumeFeatures {
  const rawText = buildResumePlainText(snapshot);
  const lowerText = rawText.toLowerCase();
  const explicitSkills = snapshot.skills.map(item => item.skillName.trim()).filter(Boolean);
  const inferredSkills = Object.entries(SKILL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => lowerText.includes(alias.toLowerCase())))
    .map(([skill]) => skill);

  return {
    targetPosition: snapshot.personalInfo.applicationPosition || '',
    educationLevel: getHighestDegree(snapshot),
    majors: unique([
      snapshot.personalInfo.major,
      ...snapshot.education.map(item => item.major),
    ]),
    skills: unique([...explicitSkills, ...inferredSkills]),
    projectKeywords: collectKeywords(snapshot.projects.flatMap(item => [
      item.projectName,
      item.role,
      item.briefIntroduction,
      item.description,
    ]).join(' ')),
    workKeywords: collectKeywords(snapshot.workExperience.flatMap(item => [
      item.company,
      item.position,
      item.description,
    ]).join(' ')),
    experienceYears: estimateExperienceYears(snapshot),
    honors: snapshot.honors.map(item => item.honorName).filter(Boolean),
    rawText,
  };
}

export async function extractResumeFeaturesWithLlm(snapshot: ResumeContentSnapshot): Promise<ResumeFeatures> {
  const fallback = extractResumeFeatures(snapshot);
  const response = await callInterviewLlmForJson<ResumeFeaturesPayload>({
    systemPrompt: 'You are a Chinese resume analysis expert. Extract structured resume features for job recommendation.',
    userPrompt: JSON.stringify({
      instruction: [
        'Read the resume snapshot and extract features.',
        'Return JSON only.',
        'Fields: targetPosition, educationLevel, majors, skills, projectKeywords, workKeywords, experienceYears, honors.',
        'Use concise Chinese labels when possible. Do not invent experience that is not supported by the resume.',
      ],
      resumeText: fallback.rawText,
      snapshot,
    }),
    temperature: 0.1,
  });

  if (!response.success || !response.data) return fallback;
  const data = response.data;

  return {
    targetPosition: normalizeText(data.targetPosition) || fallback.targetPosition,
    educationLevel: normalizeText(data.educationLevel) || fallback.educationLevel,
    majors: normalizeList(data.majors, fallback.majors),
    skills: normalizeList(data.skills, fallback.skills),
    projectKeywords: normalizeList(data.projectKeywords || data.project_keywords, fallback.projectKeywords),
    workKeywords: normalizeList(data.workKeywords || data.work_keywords, fallback.workKeywords),
    experienceYears: normalizeYears(data.experienceYears ?? data.experience_years, fallback.experienceYears),
    honors: normalizeList(data.honors, fallback.honors),
    rawText: fallback.rawText,
  };
}

export function buildResumePlainText(snapshot: ResumeContentSnapshot): string {
  const personal = snapshot.personalInfo;
  return [
    personal.name,
    personal.university,
    personal.major,
    personal.applicationPosition,
    snapshot.summary,
    snapshot.education.map(item => `${item.school} ${item.degree} ${item.major}`).join(' '),
    snapshot.workExperience.map(item => `${item.company} ${item.position} ${item.description}`).join(' '),
    snapshot.projects.map(item => `${item.projectName} ${item.role} ${item.briefIntroduction} ${item.description}`).join(' '),
    snapshot.skills.map(item => item.skillName).join(' '),
    snapshot.honors.map(item => `${item.honorName} ${item.description}`).join(' '),
  ].join(' ');
}

function getHighestDegree(snapshot: ResumeContentSnapshot): string {
  const text = snapshot.education.map(item => item.degree).join(' ');
  if (/博士/.test(text)) return '博士';
  if (/硕士|研究生/.test(text)) return '硕士';
  if (/本科|学士/.test(text)) return '本科';
  if (/专科|大专/.test(text)) return '大专';
  return snapshot.education.find(item => item.degree)?.degree || '未识别';
}

function estimateExperienceYears(snapshot: ResumeContentSnapshot): number {
  const months = snapshot.workExperience.reduce((total, item) => {
    return total + diffMonth(item.startDate, item.endDate);
  }, 0);
  return Math.round((months / 12) * 10) / 10;
}

function diffMonth(start?: string | null, end?: string | null): number {
  const startDate = parseDate(start);
  if (!startDate) return 0;
  const endDate = end && end !== '至今' ? parseDate(end) : new Date();
  if (!endDate) return 0;
  return Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth());
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/(\d{4})(?:[-/.年](\d{1,2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2] || 1) - 1, 1);
}

function collectKeywords(text: string): string[] {
  const terms = text.match(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][A-Za-z0-9+#.]{1,20}/g) || [];
  const stopwords = new Set(['负责', '参与', '完成', '使用', '项目', '系统', '平台', '经历', '工作']);
  return unique(terms.filter(term => !stopwords.has(term))).slice(0, 16);
}

function unique(items: Array<string | undefined>): string[] {
  return Array.from(new Set(items.map(item => (item || '').trim()).filter(Boolean)));
}

function normalizeText(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = unique(value.map(item => String(item)));
  return normalized.length ? normalized.slice(0, 24) : fallback;
}

function normalizeYears(value: unknown, fallback: number): number {
  const years = Number(value);
  if (!Number.isFinite(years) || years < 0) return fallback;
  return Math.round(years * 10) / 10;
}
