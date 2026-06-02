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
  snapshot: ResumeSnapshot;
}

// ========== 内部工具 ==========

const HISTORY_PREFIX = 'ai_resume_history_';
const MAX_VERSIONS_PER_TEMPLATE = 50;

function getHistoryKey(templateId: string, userId?: string | null): string {
  return `${HISTORY_PREFIX}${userId || 'guest'}_${templateId}`;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ========== 公共 API ==========

/** 获取某模板的全部历史版本（按时间倒序，最新在前） */
export function listHistory(
  templateId: string,
  userId?: string | null
): HistoryVersion[] {
  const key = getHistoryKey(templateId, userId);
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
  userId?: string | null
): HistoryVersion {
  const key = getHistoryKey(templateId, userId);
  const list = listHistory(templateId, userId);

  const version: HistoryVersion = {
    id: generateId(),
    timestamp: Date.now(),
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
  userId?: string | null
): boolean {
  const key = getHistoryKey(templateId, userId);
  const list = listHistory(templateId, userId);
  const index = list.findIndex(v => v.id === versionId);
  if (index === -1) return false;

  list.splice(index, 1);
  localStorage.setItem(key, JSON.stringify(list));
  return true;
}

/** 清空某模板的全部历史版本 */
export function clearHistory(
  templateId: string,
  userId?: string | null
): void {
  const key = getHistoryKey(templateId, userId);
  localStorage.removeItem(key);
}
