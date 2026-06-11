/**
 * 编写者：侯锦瑞
 * 模块职责：统一读取模板市场配置，供模板市场、简历预览和历史版本预览复用。
 * 数据约定：public/templates.json 是模板元数据入口，模板组件本体仍按 folderPath 动态加载。
 * 失败策略：读取失败时返回空数组，由页面层展示空状态或保持当前模板，避免整个应用白屏。
 */
import type { Template } from '../types/template';

/** 获取模板列表；调用方不需要关心配置文件路径和异常兜底逻辑。 */
export const getTemplates = async (): Promise<Template[]> => {
  try {
    const response = await fetch('/templates.json');
    if (!response.ok) {
      throw new Error('无法获取模板列表');
    }
    return await response.json();
  } catch (error) {
    console.error('获取模板列表失败:', error);
    return [];
  }
};
