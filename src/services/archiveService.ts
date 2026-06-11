/**
 * 编写者：侯锦瑞
 * 模块职责：提供简历历史版本的数据访问层，向页面和 Store 屏蔽 localStorage 的存储细节。
 * 关键设计：历史记录以“用户名 + 模板 ID”为隔离维度，避免不同账号或不同模板之间的快照互相覆盖。
 * 维护说明：标题由前后两次快照差异自动生成，只保留核心变更摘要，避免历史列表展示过长。
 */

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

const HISTORY_PREFIX = 'ai_resume_history_';
const MAX_VERSIONS_PER_TEMPLATE = 50;

// 统一封装历史版本存储键，后续如迁移到后端，只需要保持该隔离规则不变。
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

/**
 * 根据新旧快照生成历史版本标题。
 * 设计意图：用户保存时不再手动填写提交信息，系统通过模块级差异给出可读摘要。
 * 输出规则：首次保存标为“初始版本”；超过 6 处变化时折叠为“等 N 处”，保证侧栏标题可读。
 */
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

/**
 * 获取某用户在某模板下的全部历史版本。
 * 返回值按时间倒序排列；localStorage 数据损坏时返回空列表，避免历史面板渲染失败。
 */
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

/**
 * 保存当前简历快照。
 * 存储策略：新版本插入列表头部，并限制每个“用户 + 模板”最多保留 50 条，防止本地存储无限增长。
 */
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

  // 控制浏览器本地存储体积，删除最旧记录不会影响当前版本预览。
  if (list.length > MAX_VERSIONS_PER_TEMPLATE) {
    list.splice(MAX_VERSIONS_PER_TEMPLATE);
  }

  localStorage.setItem(key, JSON.stringify(list));
  return version;
}

/**
 * 删除指定历史版本。
 * 返回 boolean 供 UI 层判断是否弹出成功/失败提示。
 */
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

/** 清空当前用户在指定模板下的历史版本，用于后续扩展批量清理入口。 */
export function clearHistory(
  templateId: string,
  username?: string | null
): void {
  const key = getHistoryKey(templateId, username);
  localStorage.removeItem(key);
}

/**
 * 将旧 owner key 下的历史版本迁移到用户名维度。
 * 背景：早期版本曾用用户 id 或 guest 作为隔离 key；登录体系稳定后统一迁移到 username，保证新老数据可继续查看。
 */
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
