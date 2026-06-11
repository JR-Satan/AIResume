/**
 * 所属小组：3-3 用户模板管理组
 * 编写者：徐崇耀、侯锦瑞、潘家杰
 * 模块职责：封装扫码登录前端请求，隔离页面层与 Vite 中转接口的交互细节。
 * 关键流程：电脑创建会话并展示二维码，手机确认后回传公开用户信息，电脑轮询到 confirmed 后完成本地登录。
 * 失败策略：网络异常或会话不可用时统一返回 expired，页面层只需要处理“继续等待 / 失效重试”两类状态。
 */
import type { User } from '../types/user';

// 接口都挂在当前站点同源的 /api/scan 下（dev 中间件提供）
const BASE = '/api/scan';

/**
 * 获取二维码中应使用的站点地址。
 * 设计意图：开发环境默认 origin 可能是 localhost，手机无法访问；后端会尽量返回局域网可达地址。
 */
export async function getScanOrigin(): Promise<string> {
  try {
    const res = await fetch(`${BASE}/origin`);
    const data = await res.json();
    return data.origin || window.location.origin;
  } catch {
    return window.location.origin;
  }
}

/** 创建电脑端扫码会话，sessionId 会被编码到二维码链接中。 */
export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/create`, { method: 'POST' });
  const data = await res.json();
  return data.sessionId as string;
}

/**
 * 手机端确认登录。
 * 只回传公开 User 字段，电脑端收到后通过 authService.adoptUser 建立自己的本地登录态。
 */
export async function confirmSession(sessionId: string, user: User): Promise<boolean> {
  const res = await fetch(`${BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, user }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.success === true;
}

/** 轮询结果是扫码登录页面的状态机输入。 */
export interface ScanPollResult {
  status: 'pending' | 'confirmed' | 'expired';
  user: User | null;
}

/** 电脑端轮询会话状态；接口异常按 expired 处理，避免登录页无限卡住。 */
export async function pollSession(sessionId: string): Promise<ScanPollResult> {
  try {
    const res = await fetch(`${BASE}/poll?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return { status: 'expired', user: null };
    const data = await res.json();
    return { status: data.status, user: data.user ?? null };
  } catch {
    return { status: 'expired', user: null };
  }
}
