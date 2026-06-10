import type { ResumeContentSnapshot } from '../types/resumeImport';

const ARRAY_FIELD_PATH = /^(\w+)\[(\d+)\](?:\.(\w+))?$/;

type ArraySection = keyof Pick<
  ResumeContentSnapshot,
  'education' | 'workExperience' | 'projects' | 'skills' | 'honors'
>;

const ARRAY_SECTIONS = new Set<string>([
  'education',
  'workExperience',
  'projects',
  'skills',
  'honors',
]);

/** 从 fieldPath 解析数组下标，如 workExperience[0].description → 0 */
export function parseArrayIndexFromFieldPath(fieldPath: string): number | undefined {
  const match = fieldPath.match(ARRAY_FIELD_PATH);
  if (!match) return undefined;
  return Number(match[2]);
}

/** 导入后：根据 fieldPath 下标从 Store 快照解析稳定 itemId */
export function resolveItemIdFromFieldPath(
  fieldPath: string,
  snapshot: ResumeContentSnapshot
): number | undefined {
  const match = fieldPath.match(ARRAY_FIELD_PATH);
  if (!match) return undefined;

  const section = match[1];
  const index = Number(match[2]);
  if (!ARRAY_SECTIONS.has(section)) return undefined;

  const list = snapshot[section as ArraySection];
  const item = list[index];
  return item && 'id' in item ? (item as { id: number }).id : undefined;
}

export interface ItemWithPreviewId {
  _previewId?: number;
}

let previewIdSeq = 1;

/** 预览阶段为数组项分配临时 id，导入前用于 fieldMeta.itemId */
export function assignPreviewIds<T extends ItemWithPreviewId>(items: T[]): T[] {
  for (const item of items) {
    if (item._previewId == null) {
      item._previewId = previewIdSeq++;
    }
  }
  return items;
}

export function assignAllPreviewIds(parsed: {
  education: ItemWithPreviewId[];
  workExperience: ItemWithPreviewId[];
  projects: ItemWithPreviewId[];
  skills: ItemWithPreviewId[];
  honors: ItemWithPreviewId[];
}): void {
  assignPreviewIds(parsed.education);
  assignPreviewIds(parsed.workExperience);
  assignPreviewIds(parsed.projects);
  assignPreviewIds(parsed.skills);
  assignPreviewIds(parsed.honors);
}

export function resetPreviewIdSequence(): void {
  previewIdSeq = 1;
}

/** 写入 Store 前移除预览临时字段 */
export function stripPreviewIds(parsed: {
  education: ItemWithPreviewId[];
  workExperience: ItemWithPreviewId[];
  projects: ItemWithPreviewId[];
  skills: ItemWithPreviewId[];
  honors: ItemWithPreviewId[];
}): void {
  for (const section of ARRAY_SECTIONS) {
    for (const item of parsed[section as ArraySection]) {
      delete item._previewId;
    }
  }
}

function stripArrayIndex(fieldPath: string): string {
  return fieldPath.replace(/\[\d+\]/g, '');
}

/** 根据预览临时 id 或导入后 Store id 查找 fieldMeta */
export function matchFieldMeta<
  T extends { fieldPath: string; itemId?: number | string },
>(fieldMeta: T[], fieldPath: string, itemId?: number | string): T | undefined {
  const exact = fieldMeta.find(m => m.fieldPath === fieldPath);
  if (exact) return exact;

  if (itemId != null) {
    const suffix = fieldPath.includes('.') ? fieldPath.slice(fieldPath.lastIndexOf('.') + 1) : '';
    if (suffix) {
      const byItem = fieldMeta.find(
        m => m.itemId === itemId && (m.fieldPath.endsWith(`.${suffix}`) || m.fieldPath === suffix)
      );
      if (byItem) return byItem;
    }
  }

  const normalized = stripArrayIndex(fieldPath);
  const indexAgnostic = fieldMeta.find(m => stripArrayIndex(m.fieldPath) === normalized);
  if (indexAgnostic) return indexAgnostic;

  return undefined;
}
