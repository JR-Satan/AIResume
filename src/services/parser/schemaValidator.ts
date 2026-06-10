import { resumeTemplate } from '../../data/resumeDataTemplate';
import type {
  FieldMeta,
  FieldWarning,
  ParsedResumePayload,
  ResumeContentSnapshot,
} from '../../types/resumeImport';
import {
  assignAllPreviewIds,
  parseArrayIndexFromFieldPath,
  type ItemWithPreviewId,
  resolveItemIdFromFieldPath,
} from '../../utils/fieldPath';

const REQUIRED_PERSONAL_FIELDS = ['name', 'phone', 'email'] as const;

const ARRAY_SECTIONS = [
  'education',
  'workExperience',
  'projects',
  'skills',
  'honors',
] as const;

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asStringOrNull(value: unknown): string | null {
  const s = asString(value);
  return s || null;
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/** 兼容 LLM 返回 path 或 fieldPath */
export function normalizeFieldMeta(raw: unknown): FieldMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const fieldPath = asString(item.fieldPath ?? item.path);
  if (!fieldPath) return null;

  const confidence = item.confidence;
  const validConfidence = ['high', 'medium', 'low', 'missing'].includes(String(confidence))
    ? (confidence as FieldMeta['confidence'])
    : 'medium';

  return {
    fieldPath,
    itemId: item.itemId != null ? (item.itemId as number | string) : undefined,
    confidence: validConfidence,
    reason: asString(item.reason) || undefined,
  };
}

export function normalizeParsedResume(raw: unknown): ParsedResumePayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pi = (data.personalInfo && typeof data.personalInfo === 'object'
    ? data.personalInfo
    : {}) as Record<string, unknown>;
  const template = resumeTemplate.personalInfo;

  const personalInfo: ParsedResumePayload['personalInfo'] = {
    name: asString(pi.name ?? data.name),
    gender: asString(pi.gender ?? data.gender),
    phone: asString(pi.phone ?? data.phone),
    email: asString(pi.email ?? data.email),
    university: asString(pi.university ?? data.university),
    politicalStatus: asString(pi.politicalStatus),
    website: asString(pi.website),
    avatar: '',
    major: asString(pi.major ?? data.major),
    age: asString(pi.age),
    applicationPosition: asString(pi.applicationPosition ?? data.applicationPosition),
  };

  for (const key of Object.keys(template) as (keyof typeof template)[]) {
    if (personalInfo[key] === undefined) {
      personalInfo[key] = template[key];
    }
  }

  const education = normalizeArray<Record<string, unknown>>(data.education).map(item => ({
    school: asString(item.school),
    degree: asString(item.degree),
    major: asString(item.major),
    startDate: asString(item.startDate),
    endDate: asString(item.endDate),
  }));

  const workExperience = normalizeArray<Record<string, unknown>>(data.workExperience).map(item => ({
    company: asString(item.company),
    position: asString(item.position),
    startDate: asStringOrNull(item.startDate),
    endDate: asStringOrNull(item.endDate),
    description: asString(item.description),
  }));

  const projects = normalizeArray<Record<string, unknown>>(data.projects).map(item => ({
    projectName: asString(item.projectName),
    role: asString(item.role),
    startDate: asString(item.startDate),
    endDate: asString(item.endDate),
    briefIntroduction: asString(item.briefIntroduction),
    description: asString(item.description),
  }));

  const skills = normalizeArray<Record<string, unknown>>(data.skills).map(item => ({
    skillName: asString(item.skillName),
  }));

  const honors = normalizeArray<Record<string, unknown>>(data.honors).map(item => ({
    honorName: asString(item.honorName),
    date: asString(item.date),
    description: asString(item.description),
  }));

  return {
    personalInfo,
    education,
    workExperience,
    projects,
    skills,
    honors,
    summary: asString(data.summary),
  };
}

function getPreviewItemId(
  parsed: ParsedResumePayload,
  section: typeof ARRAY_SECTIONS[number],
  index: number
): number | string | undefined {
  const item = parsed[section][index] as ItemWithPreviewId | undefined;
  return item?._previewId;
}

function resolveIndexedFieldPath(
  fieldPath: string,
  data: ParsedResumePayload
): FieldMeta {
  if (/\[\d+\]/.test(fieldPath)) {
    const index = parseArrayIndexFromFieldPath(fieldPath);
    const section = fieldPath.split('[')[0] as typeof ARRAY_SECTIONS[number];
    if (index != null && (ARRAY_SECTIONS as readonly string[]).includes(section)) {
      return {
        fieldPath,
        itemId: getPreviewItemId(data, section, index),
        confidence: 'medium',
      };
    }
    return { fieldPath, confidence: 'medium' };
  }

  for (const section of ARRAY_SECTIONS) {
    if (fieldPath === section) {
      return { fieldPath, confidence: 'medium' };
    }
    if (fieldPath.startsWith(`${section}.`)) {
      const field = fieldPath.slice(section.length + 1);
      if (data[section].length > 0) {
        const resolved = `${section}[0].${field}`;
        return {
          fieldPath: resolved,
          itemId: getPreviewItemId(data, section, 0),
          confidence: 'medium',
        };
      }
    }
  }

  return { fieldPath, confidence: 'medium' };
}

export function buildFieldMeta(
  data: ParsedResumePayload,
  llmMeta: FieldMeta[] = []
): FieldMeta[] {
  assignAllPreviewIds(data as Parameters<typeof assignAllPreviewIds>[0]);

  const metaMap = new Map<string, FieldMeta>();
  for (const item of llmMeta) {
    const normalized = normalizeFieldMeta(item);
    if (!normalized) continue;
    const resolved = resolveIndexedFieldPath(normalized.fieldPath, data);
    metaMap.set(resolved.fieldPath, {
      ...normalized,
      fieldPath: resolved.fieldPath,
      itemId: normalized.itemId ?? resolved.itemId,
    });
  }

  for (const field of REQUIRED_PERSONAL_FIELDS) {
    const fieldPath = `personalInfo.${field}`;
    const value = data.personalInfo[field];
    if (!value) {
      metaMap.set(fieldPath, {
        fieldPath,
        confidence: 'missing',
        reason: '必填字段未识别',
      });
    } else if (!metaMap.has(fieldPath)) {
      metaMap.set(fieldPath, { fieldPath, confidence: 'high' });
    }
  }

  const checkArray = (
    prefix: typeof ARRAY_SECTIONS[number],
    items: Record<string, unknown>[],
    requiredKeys: string[]
  ) => {
    if (items.length === 0) {
      metaMap.set(prefix, {
        fieldPath: prefix,
        confidence: 'missing',
        reason: '未识别到该模块内容',
      });
      return;
    }
    items.forEach((item, index) => {
      const itemId = getPreviewItemId(data, prefix, index);
      for (const key of requiredKeys) {
        if (!asString(item[key])) {
          const fieldPath = `${prefix}[${index}].${key}`;
          metaMap.set(fieldPath, {
            fieldPath,
            itemId,
            confidence: 'low',
            reason: '字段可能识别不完整',
          });
        }
      }
    });
  };

  checkArray('education', data.education, ['school']);
  checkArray('workExperience', data.workExperience, ['company']);
  checkArray('projects', data.projects, ['projectName']);
  checkArray('skills', data.skills, ['skillName']);
  checkArray('honors', data.honors, ['honorName']);

  if (!data.summary) {
    metaMap.set('summary', {
      fieldPath: 'summary',
      confidence: 'missing',
      reason: '未识别到自我评价',
    });
  }

  return Array.from(metaMap.values());
}

export function fieldMetaToWarnings(fieldMeta: FieldMeta[]): FieldWarning[] {
  return fieldMeta
    .filter(m => m.confidence === 'low' || m.confidence === 'missing')
    .map(m => ({
      fieldPath: m.fieldPath,
      itemId: m.itemId,
      confidence: m.confidence === 'missing' ? 'missing' : 'low',
      message: m.reason ?? '请核对此字段',
    }));
}

/** 导入完成后，将 warnings 中的 itemId 替换为 Store 真实 id */
export function enrichWarningsWithStoreItemIds(
  warnings: FieldWarning[],
  snapshot: ResumeContentSnapshot
): FieldWarning[] {
  return warnings.map(w => ({
    ...w,
    itemId: resolveItemIdFromFieldPath(w.fieldPath, snapshot) ?? w.itemId,
  }));
}

export function extractJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('响应中未找到 JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function createEmptyParsedResume(): ParsedResumePayload {
  return normalizeParsedResume({});
}
