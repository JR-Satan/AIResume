// src/store/useResumeStore.ts
import { defineStore } from 'pinia';
import { resumeTemplate } from '../data/resumeDataTemplate.ts';
import { normalizeSectionOrder } from '../constants/sectionOrder';
import { message } from 'ant-design-vue';
import { useUserStore } from './useUserStore';
// 定义类型
import type {
  Education, Honor, PersonalInfo,
  Project, ResumeState, Skill,
  WorkExperience, ResumeSetting, SectionKey,
  ResumeContentSnapshot, PolishOperation
} from '../types/resume';
import { saveHistory } from '../services/archiveService';
import type { HistoryVersion, ResumeSnapshot } from '../services/archiveService';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const allowedPolishFieldPathPattern =
  /^(workExperience\[\d+\]\.description|projects\[\d+\]\.(briefIntroduction|description)|honors\[\d+\]\.description|summary)$/;

const isAllowedPolishFieldPath = (fieldPath: string): boolean =>
  allowedPolishFieldPathPattern.test(fieldPath);

const parseFieldPath = (fieldPath: string): Array<string | number> => {
  const parts: Array<string | number> = [];
  const pattern = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fieldPath)) !== null) {
    parts.push(match[2] === undefined ? match[1] : Number(match[2]));
  }
  return parts;
};

const resolveFieldPath = (root: Record<string, unknown>, fieldPath: string) => {
  const parts = parseFieldPath(fieldPath);
  if (parts.length === 0) return null;

  let target: unknown = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (target === null || target === undefined || typeof target !== 'object') {
      return null;
    }
    target = (target as Record<string, unknown>)[key as keyof typeof target];
  }

  return {
    parent: target,
    key: parts[parts.length - 1]
  };
};

const resolveHistoryUsername = (username?: string | null): string | null => {
  const normalizedUsername = username?.trim();
  if (normalizedUsername) return normalizedUsername;

  const userStore = useUserStore();
  return userStore.currentUser?.username?.trim() || null;
};

export const useResumeStore = defineStore('resume', {
  state: (): ResumeState => {
    // 从 localStorage 获取保存的数据
    const savedResumeData = localStorage.getItem('resumeData');
    const savedCurrentId = localStorage.getItem('currentId');
    const isFirstVisit = localStorage.getItem('isFirstVisit') === null; // 检查是否首次访问
    const currentId = savedCurrentId && !isNaN(Number(savedCurrentId))
      ? Number(savedCurrentId)
      : 1;
    //  此处首先用模板数据初始化，然后再从 localStorage 中读取数据
    // 这样做的好处是，程序更新后，新增的字段会自动添加到模板中
    let resumeData = JSON.parse(JSON.stringify(resumeTemplate));
    // 如果本地有保存过的数据，则合并覆盖模板数据
    if (savedResumeData) {
      try {
        const parsed = JSON.parse(savedResumeData);
        resumeData = { ...resumeData, ...parsed };
      } catch (e) {
        console.error('解析 localStorage 失败:', e);
      }
    }
    resumeData.sectionOrder = normalizeSectionOrder(resumeData.sectionOrder);
    // 如果是首次访问，标记并自动填充数据
    if (isFirstVisit) {
      localStorage.setItem('isFirstVisit', 'false');
    }

    return {
      ...resumeData,
      sectionOrder: normalizeSectionOrder(resumeData.sectionOrder),
      currentId,
      isFirstVisit, // 添加到state中
      isHistoryMode: false, // 历史预览模式（运行时状态，不持久化）
    };
  },
  actions: {
    // 初始化时检查最大 id，后面新增的时候，id是递增的
    initializeCurrentId() {
      const allIds = [
        ...this.education.map(item => item.id),
        ...this.workExperience.map(item => item.id),
        ...this.skills.map(item => item.id),
        ...this.projects.map(item => item.id),
        ...this.honors.map(item => item.id)
      ];
      this.currentId = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
      localStorage.setItem('currentId', JSON.stringify(this.currentId));
    },
    // 导出数据
    exportData() {
      const dataStr = JSON.stringify(this.$state, null, 2); // 格式化 JSON 
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume_data.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    // 导入数据
    importData(file: File) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target?.result as string);
          this.$state = jsonData; // 直接覆盖 Pinia 状态
          this.saveToLocalStorage(); // 保存到 localStorage
          message.success('数据导入成功！');
        } catch (error) {
          message.error('数据解析失败，请检查文件格式！');
        }
      };
      reader.readAsText(file);
    },
    // 清空
    clearData() {
      // 重置数据
      Object.assign(this.$state, JSON.parse(JSON.stringify(resumeTemplate))); // 彻底重置数据
      this.currentId = 1; // 重置 ID 计数
      this.saveToLocalStorage(); // 更新 localStorage
      message.success('数据已清空');
    },
    // 自动填充数据
    async autoFillData(options: { saveHistory?: boolean; username?: string | null } = {}) {
      try {
        const response = await fetch('/resumeData.json');
        const data = await response.json();
        const shouldSaveHistory = options?.saveHistory !== false;
        if (shouldSaveHistory && !this.isHistoryMode) {
          this.saveHistorySnapshot(options.username);
        }
        this.$state = { ...data, isFirstVisit: false, isHistoryMode: false }; // 保持 isFirstVisit，重置历史模式
        this.saveToLocalStorage();
        message.success('数据已自动填充');
      } catch (error) {
        message.error('加载数据失败');
      }
    },

    // 保存当前数据为历史版本快照
    saveHistorySnapshot(username?: string | null): HistoryVersion | null {
      if (this.isHistoryMode) return null;

      const historyUsername = resolveHistoryUsername(username);
      if (!historyUsername) {
        console.warn('未获取到当前登录用户，历史版本未保存');
        return null;
      }

      const templateId = String(this.resumeSetting?.currentTemplate || resumeTemplate.resumeSetting.currentTemplate);
      if (!templateId) return null;

      const snapshot: ResumeSnapshot = {
        personalInfo: JSON.parse(JSON.stringify(this.personalInfo)),
        education: JSON.parse(JSON.stringify(this.education)),
        workExperience: JSON.parse(JSON.stringify(this.workExperience)),
        skills: JSON.parse(JSON.stringify(this.skills)),
        projects: JSON.parse(JSON.stringify(this.projects)),
        honors: JSON.parse(JSON.stringify(this.honors)),
        summary: this.summary,
        sectionOrder: [...this.sectionOrder],
        resumeSetting: JSON.parse(JSON.stringify(this.resumeSetting)),
      };

      return saveHistory(snapshot, templateId, historyUsername);
    },

    // 进入历史版本预览
    enterHistoryPreview(snapshot: ResumeSnapshot) {
      // 先备份当前状态到专用 localStorage key
      const backup = JSON.stringify(this.$state);
      localStorage.setItem('resumeData_history_backup', backup);

      // 加载历史快照数据到 store（保留 isHistoryMode 和 isFirstVisit）
      this.$state = {
        ...this.$state,
        ...snapshot,
        isFirstVisit: false,
        isHistoryMode: true,
      };
    },

    // 退出历史版本预览，恢复原始状态
    exitHistoryPreview() {
      const backupStr = localStorage.getItem('resumeData_history_backup');
      if (backupStr) {
        try {
          const backupData = JSON.parse(backupStr);
          this.$state = { ...backupData, isHistoryMode: false };
          this.initializeCurrentId();
        } catch (e) {
          console.error('恢复历史版本备份失败:', e);
          this.isHistoryMode = false;
        }
      } else {
        this.isHistoryMode = false;
      }
      localStorage.removeItem('resumeData_history_backup');
    },
    // 保存到 localStorage
    saveToLocalStorage() {
      localStorage.setItem('resumeData', JSON.stringify(this.$state));
      localStorage.setItem('currentId', JSON.stringify(this.currentId));
    },

    getResumeSnapshot(): ResumeContentSnapshot {
      return clone({
        personalInfo: this.personalInfo,
        education: this.education,
        workExperience: this.workExperience,
        skills: this.skills,
        projects: this.projects,
        honors: this.honors,
        summary: this.summary,
        sectionOrder: this.sectionOrder
      });
    },

    getFieldValue(fieldPath: string): unknown {
      const resolved = resolveFieldPath(this.$state as unknown as Record<string, unknown>, fieldPath);
      if (!resolved || resolved.parent === null || resolved.parent === undefined || typeof resolved.parent !== 'object') {
        return undefined;
      }
      return (resolved.parent as Record<string, unknown>)[resolved.key as keyof typeof resolved.parent];
    },

    applyPolishOperations(operations: PolishOperation[]) {
      const applied: PolishOperation[] = [];
      const skipped: Array<PolishOperation & { reason: string }> = [];

      operations.forEach((operation) => {
        if (!isAllowedPolishFieldPath(operation.fieldPath)) {
          skipped.push({ ...operation, reason: '不允许修改该字段' });
          return;
        }

        const resolved = resolveFieldPath(this.$state as unknown as Record<string, unknown>, operation.fieldPath);
        if (!resolved || resolved.parent === null || resolved.parent === undefined || typeof resolved.parent !== 'object') {
          skipped.push({ ...operation, reason: '字段路径不存在' });
          return;
        }

        const parent = resolved.parent as Record<string, unknown>;
        const currentValue = parent[resolved.key as keyof typeof parent];
        if (currentValue !== operation.oldValue) {
          skipped.push({ ...operation, reason: '字段内容已被修改' });
          return;
        }

        parent[resolved.key as keyof typeof parent] = operation.newValue;
        applied.push(operation);
      });

      if (applied.length > 0) {
        this.saveToLocalStorage();
      }

      return { applied, skipped };
    },

    setSectionOrder(order: SectionKey[]) {
      this.sectionOrder = normalizeSectionOrder(order);
      this.saveToLocalStorage();
    },

    moveSection(source: SectionKey, target: SectionKey, placement: 'before' | 'after' = 'before') {
      if (source === target) return;
      const order = [...this.sectionOrder];
      const fromIndex = order.indexOf(source);
      const targetIndex = order.indexOf(target);
      if (fromIndex === -1 || targetIndex === -1) return;
      const [item] = order.splice(fromIndex, 1);
      let insertIndex = targetIndex;
      if (fromIndex < targetIndex) {
        insertIndex = targetIndex - 1;
      }
      if (placement === 'after') {
        insertIndex += 1;
      }
      if (insertIndex < 0) insertIndex = 0;
      if (insertIndex > order.length) insertIndex = order.length;
      order.splice(insertIndex, 0, item);
      this.sectionOrder = normalizeSectionOrder(order);
      this.saveToLocalStorage();
    },

    // 通用新增方法
    addItem<T extends { id: number }>(list: T[], newItem: Omit<T, 'id'>) {
      const newEntry = { ...newItem, id: this.currentId++ } as T;
      list.push(newEntry);
      this.saveToLocalStorage();
    },
    // 简历设置内容
    updateResumeSetting(updatedSetting: Partial<ResumeSetting>) {
      this.resumeSetting = { ...this.resumeSetting, ...updatedSetting };
      this.saveToLocalStorage();
    },

    // 通用删除方法
    deleteItem<T extends { id: number }>(list: T[], id: number) {
      const index = list.findIndex(item => item.id === id);
      if (index !== -1) {
        list.splice(index, 1);
        this.saveToLocalStorage();
      }
    },

    // 通用更新方法
    updateItem<T extends { id: number }>(list: T[], updatedItem: T) {
      const index = list.findIndex(item => item.id === updatedItem.id);
      if (index !== -1) {
        list[index] = updatedItem;
        this.saveToLocalStorage();
      }
    },

    // 更新个人信息
    updatePersonalInfo(updatedInfo: Partial<PersonalInfo>) {
      this.personalInfo = { ...this.personalInfo, ...updatedInfo };
      this.saveToLocalStorage();
    },

    // 更新自我评价
    updateSummary(updatedSummary: string) {
      this.summary = updatedSummary;
      this.saveToLocalStorage();
    },

    // 新增教育经历
    addEducation(newItem: Omit<Education, 'id'>) {
      this.addItem(this.education, newItem);
    },

    // 删除教育经历
    deleteEducation(id: number) {
      this.deleteItem(this.education, id);
    },

    // 更新教育经历
    updateEducation(updatedItem: Education) {
      this.updateItem(this.education, updatedItem);
    },

    // 新增工作经验
    addWorkExperience(newItem: Omit<WorkExperience, 'id'>) {
      this.addItem(this.workExperience, newItem);
    },

    // 删除工作经验
    deleteWorkExperience(id: number) {
      this.deleteItem(this.workExperience, id);
    },

    // 更新工作经验
    updateWorkExperience(updatedItem: WorkExperience) {
      this.updateItem(this.workExperience, updatedItem);
    },

    // 新增技能
    addSkill(newItem: Omit<Skill, 'id'>) {
      this.addItem(this.skills, newItem);
    },

    // 删除技能
    deleteSkill(id: number) {
      this.deleteItem(this.skills, id);
    },

    // 更新技能
    updateSkill(updatedItem: Skill) {
      this.updateItem(this.skills, updatedItem);
    },

    // 新增项目经验
    addProject(newItem: Omit<Project, 'id'>) {
      this.addItem(this.projects, newItem);
    },

    // 删除项目经验
    deleteProject(id: number) {
      this.deleteItem(this.projects, id);
    },

    // 更新项目经验
    updateProject(updatedItem: Project) {
      this.updateItem(this.projects, updatedItem);
    },

    // 新增荣誉奖项
    addHonor(newItem: Omit<Honor, 'id'>) {
      this.addItem(this.honors, newItem);
    },

    // 删除荣誉奖项
    deleteHonor(id: number) {
      this.deleteItem(this.honors, id);
    },

    // 更新荣誉奖项
    updateHonor(updatedItem: Honor) {
      this.updateItem(this.honors, updatedItem);
    },

    loadFromLocalStorage() {
      const stored = localStorage.getItem('resumeStore');
      if (stored) {
        this.$state = JSON.parse(stored);
      }
    },

    // 初始化检查
    async initCheck() {
      if (this.isFirstVisit) {
        await this.autoFillData({ saveHistory: false });
      }
    }
  }
});


