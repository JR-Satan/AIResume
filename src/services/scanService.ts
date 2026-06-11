/**
 * 3-3 用户模板管理组
 * 编写者：3-3 小组（蔡世强、侯锦瑞、徐崇耀、张楚唯、潘家杰、王杰）
 * 功能：封装扫码登录前端接口，负责创建扫码会话、手机确认登录和电脑端轮询登录结果。
 */
// 扫码登录接口（对接 vite-plugins/scanLoginServer 的中转服务）
//
// 这是「手机扫码 → 电脑自动登录」的跨设备通道：
//   - 电脑端：createSession 拿 sessionId → pollSession 轮询直到 confirmed；
//   - 手机端：登录后 confirmSession 把账号信息回传到对应会话。
import type { User } from '../types/user';

// 接口都挂在当前站点同源的 /api/scan 下（dev 中间件提供）
const BASE = '/api/scan';

// 电脑端：获取二维码应编码的访问地址，避免 localhost 导致手机无法访问
export async function getScanOrigin(): Promise<string> {
  try {
    const res = await fetch(`${BASE}/origin`);
    const data = await res.json();
    return data.origin || window.location.origin;
  } catch {
    return window.location.origin;
  }
}

// 电脑端：创建扫码会话，返回 sessionId
export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/create`, { method: 'POST' });
  const data = await res.json();
  return data.sessionId as string;
}

// 手机端：确认登录，把公开用户信息回传到会话
export async function confirmSession(sessionId: string, user: User): Promise<boolean> {
  const res = await fetch(`${BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, user }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.success === true;
}

// 会话轮询结果
export interface ScanPollResult {
  status: 'pending' | 'confirmed' | 'expired';
  user: User | null;
}

// 电脑端：轮询会话状态
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
