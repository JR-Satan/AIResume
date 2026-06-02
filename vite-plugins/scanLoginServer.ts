// 扫码登录中转服务（Vite dev 中间件）
//
// 纯前端项目本身没有后端，手机与电脑的 localStorage 互不相通，
// 无法实现「手机扫码 → 电脑自动登录」。本插件在 dev server 上挂一组
// 轻量接口，用内存里的「扫码会话」做中转：
//   1. 电脑端 create 一个会话，拿到 sessionId，把它编进二维码；
//   2. 手机扫码打开站点，登录后 confirm，把账号信息回传到该会话；
//   3. 电脑端轮询 poll，拿到 confirmed 的账号信息后在本地登录。
//
// 会话只存在内存（Map），带过期时间，无需数据库。仅用于本地/局域网演示。
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// 单个扫码会话
interface ScanSession {
  status: 'pending' | 'confirmed';
  createdAt: number;
  // 手机确认后回传的公开用户信息（与前端 User 同结构，电脑端据此本地登录）
  user?: unknown;
}

const SESSION_TTL = 5 * 60 * 1000; // 会话有效期 5 分钟
const sessions = new Map<string, ScanSession>();

// 生成会话 id（时间戳 + 随机串，足够本地唯一）
const genSessionId = () =>
  `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// 清理过期会话
const sweep = () => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
};

// 读取请求 JSON body
const readBody = (req: IncomingMessage): Promise<any> =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

// 统一 JSON 响应
const sendJson = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

export function scanLoginServer(): Plugin {
  return {
    name: 'scan-login-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/scan/')) return next();
        sweep();

        // 电脑端：创建扫码会话
        if (url.startsWith('/api/scan/create') && req.method === 'POST') {
          const sessionId = genSessionId();
          sessions.set(sessionId, { status: 'pending', createdAt: Date.now() });
          return sendJson(res, 200, { sessionId });
        }

        // 手机端：确认登录，回传账号信息
        if (url.startsWith('/api/scan/confirm') && req.method === 'POST') {
          const body = await readBody(req);
          const { sessionId, user } = body || {};
          const session = sessions.get(sessionId);
          if (!session) {
            return sendJson(res, 404, { success: false, message: '会话不存在或已过期' });
          }
          session.status = 'confirmed';
          session.user = user;
          return sendJson(res, 200, { success: true });
        }

        // 电脑端：轮询会话状态
        if (url.startsWith('/api/scan/poll') && req.method === 'GET') {
          const sessionId = new URL(url, 'http://localhost').searchParams.get('sessionId') || '';
          const session = sessions.get(sessionId);
          if (!session) {
            return sendJson(res, 404, { status: 'expired' });
          }
          return sendJson(res, 200, { status: session.status, user: session.user ?? null });
        }

        return sendJson(res, 405, { message: 'Method Not Allowed' });
      });
    },
  };
}
