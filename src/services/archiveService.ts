/**
 * 编写者：侯锦瑞
 * 功能：按用户和模板隔离保存简历历史版本，负责历史快照、标题生成、删除清空和旧数据迁移。
 */
// 简历历史版本存档服务
// 使用 localStorage 按用户 + 模板隔离存储历史版本数据

import type { ResumeState, SectionKey } from '../types/resume';

// ========== 类型定义 ==========

/** 简历内容快照（不含元数据字段） */
export interface ResumeSnapshot {
  personalInfo: ResumeState['personalInfo'];
  education: ResumeState['education'];
  workExperience: ResumeState['workExperience'];
  skills: ResumeState['skills'];
  projects: ResumeState['projects'];
  honors: ResumeState['honors'];
  summary: ResumeState['summary'];
  sectionOrder: SectionKey[];
  resumeSetting: ResumeState['resumeSetting'];
}

/** 单个历史版本 */
export interface HistoryVersion {
  id: string;
  timestamp: number;
  title?: string;
  snapshot: ResumeSnapshot;
}

// ========== 内部工具 ==========

const HISTORY_PREFIX = 'ai_resume_history_';
const MAX_VERSIONS_PER_TEMPLATE = 50;

function getHistoryKey(templateId: string, username?: string | null): string {
  return `${HISTORY_PREFIX}${username?.trim() || 'guest'}_${templateId}`;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function appendChange(changes: string[], label: string): void {
  if (!changes.includes(label)) {
    changes.push(label);
  }
}

function collectItemChanges<T extends { id?: number | string }>(
  current: T[],
  previous: T[] | undefined,
  label: string
): string[] {
  if (!previous) return [];

  const changes: string[] = [];
  const previousByKey = new Map<string, { item: T; index: number }>();
  previous.forEach((item, index) => {
    previousByKey.set(String(item.id ?? index), { item, index });
  });

  const currentKeys = new Set<string>();
  current.forEach((item, index) => {
    const key = String(item.id ?? index);
    currentKeys.add(key);
    const previousItem = previousByKey.get(key);

    if (!previousItem || previousItem.index !== index || !isSameValue(item, previousItem.item)) {
      appendChange(changes, `${label} #${index + 1}`);
    }
  });

  previous.forEach((item, index) => {
    const key = String(item.id ?? index);
    if (!currentKeys.has(key)) {
      appendChange(changes, `${label} #${index + 1}`);
    }
  });

  return changes;
}

function generateHistoryTitle(snapshot: ResumeSnapshot, previous?: ResumeSnapshot): string | undefined {
  if (!previous) return '初始版本';

  const changes: string[] = [];
  if (!isSameValue(snapshot.personalInfo, previous.personalInfo)) appendChange(changes, '个人信息');
  if (!isSameValue(snapshot.summary, previous.summary)) appendChange(changes, '个人总结');
  if (!isSameValue(snapshot.sectionOrder, previous.sectionOrder)) appendChange(changes, '模块顺序');
  if (!isSameValue(snapshot.resumeSetting, previous.resumeSetting)) appendChange(changes, '简历设置');

  changes.push(...collectItemChanges(snapshot.education, previous.education, '教育经历'));
  changes.push(...collectItemChanges(snapshot.workExperience, previous.workExperience, '工作经历'));
  changes.push(...collectItemChanges(snapshot.skills, previous.skills, '技能'));
  changes.push(...collectItemChanges(snapshot.projects, previous.projects, '项目经历'));
  changes.push(...collectItemChanges(snapshot.honors, previous.honors, '荣誉奖项'));

  if (changes.length === 0) return '改动：无明显内容变化';

  const visibleChanges = changes.slice(0, 6);
  const suffix = changes.length > visibleChanges.length ? ` 等 ${changes.length} 处` : '';
  return `改动：${visibleChanges.join('，')}${suffix}`;
}

// ========== 公共 API ==========

/** 获取某模板的全部历史版本（按时间倒序，最新在前） */
export function listHistory(
  templateId: string,
  username?: string | null
): HistoryVersion[] {
  const key = getHistoryKey(templateId, username);
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const list: HistoryVersion[] = JSON.parse(raw);
    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/** 保存一条新的历史版本 */
export function saveHistory(
  snapshot: ResumeSnapshot,
  templateId: string,
  username?: string | null
): HistoryVersion {
  const key = getHistoryKey(templateId, username);
  const list = listHistory(templateId, username);
  const title = generateHistoryTitle(snapshot, list[0]?.snapshot);

  const version: HistoryVersion = {
    id: generateId(),
    timestamp: Date.now(),
    ...(title ? { title } : {}),
    snapshot,
  };

  list.unshift(version);

  // 超过上限时删除最旧的记录
  if (list.length > MAX_VERSIONS_PER_TEMPLATE) {
    list.splice(MAX_VERSIONS_PER_TEMPLATE);
  }

  localStorage.setItem(key, JSON.stringify(list));
  return version;
}

/** 删除指定的历史版本 */
export function deleteHistory(
  versionId: string,
  templateId: string,
  username?: string | null
): boolean {
  const key = getHistoryKey(templateId, username);
  const list = listHistory(templateId, username);
  const index = list.findIndex(v => v.id === versionId);
  if (index === -1) return false;

  list.splice(index, 1);
  localStorage.setItem(key, JSON.stringify(list));
  return true;
}

/** 清空某模板的全部历史版本 */
export function clearHistory(
  templateId: string,
  username?: string | null
): void {
  const key = getHistoryKey(templateId, username);
  localStorage.removeItem(key);
}

/** 将同一用户旧 owner key 下的历史版本迁移到新 owner key 下 */
export function migrateHistoryOwner(
  templateId: string,
  fromOwner?: string | null,
  toOwner?: string | null
): number {
  const normalizedFrom = fromOwner?.trim();
  const normalizedTo = toOwner?.trim();
  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) return 0;

  const fromKey = getHistoryKey(templateId, normalizedFrom);
  const toKey = getHistoryKey(templateId, normalizedTo);
  const fromList = listHistory(templateId, normalizedFrom);
  if (fromList.length === 0) return 0;

  const toList = listHistory(templateId, normalizedTo);
  const mergedMap = new Map<string, HistoryVersion>();
  for (const version of [...toList, ...fromList]) {
    mergedMap.set(version.id, version);
  }

  const mergedList = Array.from(mergedMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_VERSIONS_PER_TEMPLATE);

  localStorage.setItem(toKey, JSON.stringify(mergedList));
  localStorage.removeItem(fromKey);
  return fromList.length;
}
