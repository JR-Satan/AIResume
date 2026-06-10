import type {
  Education,
  Honor,
  PersonalInfo,
  Project,
  SectionKey,
  Skill,
  WorkExperience,
  ResumeContentSnapshot,
} from './resume';

export type { ResumeContentSnapshot };

/** 解析输出（id 由 Store 自动分配） */
export interface ParsedResumePayload {
  personalInfo: Partial<PersonalInfo>;
  education: Omit<Education, 'id'>[];
  workExperience: Omit<WorkExperience, 'id'>[];
  projects: Omit<Project, 'id'>[];
  skills: Omit<Skill, 'id'>[];
  honors: Omit<Honor, 'id'>[];
  summary: string;
  sectionOrder?: SectionKey[];
}

export interface ImportOptions {
  mode?: 'replace' | 'merge';
  persist?: boolean;
  source?: 'ocr-import' | 'json-import' | 'manual';
  fileName?: string;
}

/**
 * 字段定位告警（与 3-4 suggestions.fieldPath / itemId 口径一致）
 * - fieldPath：与 3-1 高亮、3-4 修改建议共用
 * - itemId：数组项稳定 id；预览阶段为 _previewId，导入后为 Store 分配的 id
 */
export interface FieldWarning {
  fieldPath: string;
  itemId?: number | string;
  confidence: 'low' | 'missing';
  message: string;
}

export interface ImportResult {
  success: boolean;
  resumeId?: string;
  stats: {
    education: number;
    workExperience: number;
    projects: number;
    skills: number;
    honors: number;
  };
  warnings?: FieldWarning[];
}

/** 字段置信度元数据（与 3-4 fieldPath 规范统一） */
export interface FieldMeta {
  fieldPath: string;
  itemId?: number | string;
  confidence: 'high' | 'medium' | 'low' | 'missing';
  reason?: string;
}

export interface OcrOptions {
  language?: 'chi_sim+eng';
  onProgress?: (percent: number) => void;
}

export interface OcrResult {
  success: boolean;
  rawText: string;
  pageCount?: number;
  method: 'pdf-text' | 'tesseract' | 'vision-api';
  error?: string;
}

export interface ParseOptions {
  onProgress?: (stage: 'parsing' | 'validating') => void;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedResumePayload;
  fieldMeta?: FieldMeta[];
  rawText?: string;
  error?: string;
}

export type ResumeImportEvent =
  | { type: 'IMPORT_STARTED'; fileName: string }
  | { type: 'IMPORT_OCR_DONE'; rawTextLength: number }
  | { type: 'IMPORT_PARSE_DONE'; fieldCount: number }
  | { type: 'IMPORT_CONFIRMED'; result: ImportResult }
  | { type: 'IMPORT_FAILED'; error: string; stage: 'upload' | 'ocr' | 'parse' | 'save' }
  | { type: 'IMPORT_CANCELLED' };

export type ResumeImportEventType = ResumeImportEvent['type'];

export interface BatchImportItem {
  id: string;
  file: File;
  status: 'pending' | 'ocr' | 'parsing' | 'preview' | 'done' | 'error';
  rawText?: string;
  parsed?: ParsedResumePayload;
  fieldMeta?: FieldMeta[];
  error?: string;
}

/** 3-4 可选提供 — 四维评价报告（3-2 不调用，仅文档约定） */
export interface ResumeEvaluationReport {
  scores: {
    completeness: number;
    professionalism: number;
    readability: number;
    jobMatch: number;
    total: number;
  };
  suggestions: Array<{
    fieldPath?: string;
    itemId?: number | string;
    problem: string;
    advice: string;
  }>;
}
