/**
 * 编写者：侯锦瑞
 * 功能：读取模板市场配置，向模板市场和简历预览模块提供可用模板列表。
 */
import type { Template } from '../types/template';

export const getTemplates = async (): Promise<Template[]> => {
  try {
    const response = await fetch('/templates.json'); // 使用绝对路径
    if (!response.ok) {
      throw new Error('无法获取模板列表');
    }
    return await response.json();
  } catch (error) {
    console.error('获取模板列表失败:', error);
    return [];
  }
};
