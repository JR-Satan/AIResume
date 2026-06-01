// 简历存档服务层（预留接口）
//
// 目标：将来支持「每个用户拥有自己独立的多版本简历存档」。
// 本文件目前只定义按用户隔离的存储 key 约定与接口签名，
// 具体的存档读写 UI / 逻辑留待后续实现 —— 届时上层无需改动调用方式，
// 只需在此填充实现，或将内部替换为后端请求。

// 按用户隔离的存档存储 key：登录用户用其 id，未登录统一用 guest
const ARCHIVE_PREFIX = 'ai_resume_archive_';

export const getArchiveKey = (userId?: string | null): string =>
  `${ARCHIVE_PREFIX}${userId || 'guest'}`;

// 单个存档（版本）的基础结构
export interface ResumeArchive {
  id: string;
  name: string; // 版本名称
  updatedAt: number;
  data: unknown; // 该版本的完整简历数据
}

// 列出某用户的全部存档
export async function listArchives(userId?: string | null): Promise<ResumeArchive[]> {
  // TODO: 后续实现 —— 从 getArchiveKey(userId) 读取存档列表
  void getArchiveKey(userId);
  return [];
}

// 保存 / 新建一个存档版本
export async function saveArchive(
  _userId: string | null,
  _archive: Omit<ResumeArchive, 'id' | 'updatedAt'> & { id?: string }
): Promise<ResumeArchive | null> {
  // TODO: 后续实现 —— 写入对应用户命名空间的存档
  return null;
}

// 读取指定存档版本
export async function loadArchive(
  _userId: string | null,
  _archiveId: string
): Promise<ResumeArchive | null> {
  // TODO: 后续实现 —— 返回指定版本数据
  return null;
}

// 删除指定存档版本
export async function deleteArchive(
  _userId: string | null,
  _archiveId: string
): Promise<boolean> {
  // TODO: 后续实现
  return false;
}
