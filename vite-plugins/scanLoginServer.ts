/**
 * 编写者：徐崇耀、侯锦瑞
 * 模块职责：在 Vite 开发服务器上提供扫码登录中转接口，弥补纯前端项目没有后端会话服务的问题。
 * 关键设计：用内存 Map 保存短期扫码会话，只中转手机端确认结果，不持久化账号密码或简历数据。
 * 网络策略：当请求来自 localhost 时，优先推断局域网 IPv4 地址，确保手机扫码后访问的是电脑可达地址。
 * 适用范围：该插件用于课程演示和局域网开发环境；生产环境应替换为真实后端会话服务。
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

// 单个扫码会话只保存状态和公开用户信息，避免把敏感认证数据放入中转层。
interface ScanSession {
  status: 'pending' | 'confirmed';
  createdAt: number;
  // 手机确认后回传的公开用户信息（与前端 User 同结构，电脑端据此本地登录）
  user?: unknown;
}

const SESSION_TTL = 5 * 60 * 1000; // 会话有效期 5 分钟，降低二维码被长期复用的风险。
const sessions = new Map<string, ScanSession>();

// 生成会话 id（时间戳 + 随机串），满足本地演示场景下的唯一性要求。
const genSessionId = () =>
  `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const normalizeExplicitHost = (host?: string | boolean | null) => {
  if (typeof host !== 'string') return '';
  if (!host || host === '0.0.0.0' || host === '::') return '';
  return host.replace(/^https?:\/\//, '').split(':')[0];
};

const isVirtualInterface = (name: string) =>
  /vmware|virtualbox|veth|vethernet|docker|wsl|hyper-v|loopback|蓝牙/i.test(name);

/**
 * 推断手机可访问的局域网 IPv4 地址。
 * 优先级：显式环境变量 > Vite host > 非虚拟网卡；无线网卡和常见私网地址段权重更高。
 */
const getLanAddress = (configuredHost?: string | boolean | null) => {
  const explicitHost =
    normalizeExplicitHost(process.env.VITE_SCAN_HOST) ||
    normalizeExplicitHost(process.env.SCAN_LOGIN_HOST) ||
    normalizeExplicitHost(configuredHost);

  if (explicitHost) return explicitHost;

  const networks = networkInterfaces();
  const candidates: Array<{ address: string; score: number }> = [];

  for (const [interfaceName, interfaces] of Object.entries(networks)) {
    for (const item of interfaces || []) {
      const name = interfaceName || '';
      if (item.family !== 'IPv4' || item.internal || isVirtualInterface(name)) continue;

      let score = 0;
      if (/wlan|wi-?fi|wireless|无线/i.test(name)) score += 30;
      if (/ethernet|以太网/i.test(name)) score += 10;
      if (/^10\./.test(item.address)) score += 8;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(item.address)) score += 6;
      if (/^192\.168\./.test(item.address)) score += 4;
      candidates.push({ address: item.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || 'localhost';
};

const getRequestOrigin = (req: IncomingMessage, configuredHost?: string | boolean | null) => {
  const explicitOrigin = process.env.VITE_SCAN_ORIGIN || process.env.SCAN_LOGIN_ORIGIN;
  if (explicitOrigin) return explicitOrigin.replace(/\/$/, '');

  const host = req.headers.host || 'localhost:5173';
  const hostName = host.split(':')[0];
  const isLocalhost = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
  const port = host.includes(':') ? host.split(':').pop() : '';
  const protocol = (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted ? 'https' : 'http';
  const reachableHost = isLocalhost ? getLanAddress(configuredHost) : hostName;
  return `${protocol}://${reachableHost}${port ? `:${port}` : ''}`;
};

// 每次扫码接口请求前清理过期会话，避免 dev server 长时间运行导致内存会话堆积。
const sweep = () => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
};

// 中转接口只需要轻量 JSON body；解析失败时返回空对象，由业务分支给出明确响应。
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

// 统一 JSON 响应格式，便于前端 scanService 只处理状态和数据。
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

        // 电脑端：获取二维码应使用的局域网访问地址
        if (url.startsWith('/api/scan/origin') && req.method === 'GET') {
          return sendJson(res, 200, { origin: getRequestOrigin(req, server.config.server.host) });
        }

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
