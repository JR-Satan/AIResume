/**
 * 所属小组：3-3 用户模板管理组
 * 编写者：徐崇耀、蔡世强
 * 模块职责：封装本地账号体系的数据访问逻辑，供登录页和用户 Store 调用。
 * 关键设计：账号表、密码摘要和登录态均保存在浏览器 localStorage，页面层不直接操作用户表。
 * 安全边界：密码只保存 SHA256(password + salt) 的摘要；该方案满足课程演示，不等同于生产级后端认证。
 * 扩展说明：如后续接入真实后端，优先替换本文件 API 内部实现，保持 Store 调用方式不变。
 */
import CryptoJS from 'crypto-js';
import type { AuthResult, StoredUser, User, UserProfile } from '../types/user';

// localStorage 存储键
const USERS_KEY = 'ai_resume_users'; // 用户表（StoredUser[]）
const SESSION_KEY = 'ai_resume_session'; // 当前登录用户 id

// 模拟异步，便于将来无缝替换为真实网络请求
const delay = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 读取失败时返回空表，避免损坏的 localStorage 数据阻塞登录页加载。
const readUsers = (): StoredUser[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch (e) {
    console.error('解析用户数据失败:', e);
    return [];
  }
};

const writeUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const isStoredUser = (value: unknown): value is StoredUser => {
  const user = value as Partial<StoredUser>;
  return (
    typeof user?.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.nickname === 'string' &&
    typeof user.avatar === 'string' &&
    typeof user.createdAt === 'number' &&
    typeof user.salt === 'string' &&
    typeof user.passwordHash === 'string'
  );
};

let usersInitPromise: Promise<void> | null = null;

/**
 * 合并 public/users.json 中的初始账号。
 * 设计意图：项目首次运行时可提供演示账号，同时不覆盖用户运行期注册或修改过的本地账号。
 * 幂等策略：用 usersInitPromise 保证一次页面生命周期内只初始化一次，避免重复 fetch 和重复合并。
 */
export const ensureUsersInitialized = async (): Promise<void> => {
  if (usersInitPromise) return usersInitPromise;

  usersInitPromise = (async () => {
    try {
      const response = await fetch('/users.json');
      if (!response.ok) return;

      const payload = await response.json();
      const seededUsers = Array.isArray(payload) ? payload : payload?.users;
      if (!Array.isArray(seededUsers)) return;

      const validSeededUsers = seededUsers.filter(isStoredUser);
      if (validSeededUsers.length === 0) return;

      const users = readUsers();
      const existingUsernames = new Set(users.map((user) => user.username));
      const existingIds = new Set(users.map((user) => user.id));
      const merged = [...users];

      for (const seededUser of validSeededUsers) {
        if (existingUsernames.has(seededUser.username) || existingIds.has(seededUser.id)) continue;
        merged.push(seededUser);
      }

      if (merged.length !== users.length) {
        writeUsers(merged);
      }
    } catch (e) {
      console.error('初始化用户 JSON 失败:', e);
    }
  })();

  return usersInitPromise;
};

// 每个账号独立 salt，避免相同密码产生完全相同的摘要。
const genSalt = () => CryptoJS.lib.WordArray.random(16).toString();

// 密码哈希：只保存摘要，不保存明文密码。
const hashPassword = (password: string, salt: string) =>
  CryptoJS.SHA256(password + salt).toString();

// 生成用户 id（时间戳 + 随机串，足够本地唯一）
const genId = () =>
  `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 对外返回用户信息前移除 passwordHash 和 salt，避免页面层误用敏感字段。
const toPublicUser = (u: StoredUser): User => {
  const { passwordHash, salt, ...pub } = u;
  return pub;
};

/**
 * 注册本地账号。
 * 业务规则：用户名去除首尾空格后必须唯一；注册成功后立即写入登录态，减少用户二次登录步骤。
 */
export async function register(
  username: string,
  password: string,
  profile?: Partial<UserProfile>
): Promise<AuthResult> {
  await delay();
  const name = username.trim();
  if (!name || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }
  const users = readUsers();
  if (users.some((u) => u.username === name)) {
    return { success: false, message: '该用户名已存在' };
  }
  const salt = genSalt();
  const stored: StoredUser = {
    id: genId(),
    username: name,
    nickname: profile?.nickname?.trim() || name,
    avatar: profile?.avatar || '',
    createdAt: Date.now(),
    salt,
    passwordHash: hashPassword(password, salt),
  };
  users.push(stored);
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, stored.id); // 注册后自动登录
  return { success: true, message: '注册成功', user: toPublicUser(stored) };
}

/**
 * 账号密码登录。
 * 校验方式：使用提交密码和账号 salt 重新计算摘要，再与本地摘要比对。
 */
export async function login(username: string, password: string): Promise<AuthResult> {
  await delay();
  const name = username.trim();
  const users = readUsers();
  const found = users.find((u) => u.username === name);
  if (!found || found.passwordHash !== hashPassword(password, found.salt)) {
    return { success: false, message: '用户名或密码错误' };
  }
  localStorage.setItem(SESSION_KEY, found.id);
  return { success: true, message: '登录成功', user: toPublicUser(found) };
}

/**
 * 本机扫码登录入口。
 * 设计意图：将设备版本标识映射为本地账号用户名，使扫码账号与账密账号共用用户表和历史版本隔离规则。
 * 处理策略：已存在则直接登录；首次出现则自动创建随机密码占位账号，避免生成可被明文登录的默认密码。
 */
export async function scanLogin(versionKey: string): Promise<AuthResult> {
  await delay();
  const key = versionKey.trim();
  if (!key) {
    return { success: false, message: '无法识别设备信息' };
  }
  const users = readUsers();
  const found = users.find((u) => u.username === key);
  if (found) {
    localStorage.setItem(SESSION_KEY, found.id);
    return { success: true, message: '扫码登录成功', user: toPublicUser(found) };
  }
  // 首次扫码：自动注册。密码随机生成且不回传，仅用于占位哈希。
  const salt = genSalt();
  const randomPassword = CryptoJS.lib.WordArray.random(16).toString();
  const stored: StoredUser = {
    id: genId(),
    username: key,
    nickname: key,
    avatar: '',
    createdAt: Date.now(),
    salt,
    passwordHash: hashPassword(randomPassword, salt),
  };
  users.push(stored);
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, stored.id);
  return { success: true, message: '已为该设备创建账号并登录', user: toPublicUser(stored) };
}

/**
 * 采纳手机端确认后的账号信息。
 * 场景：手机和电脑 localStorage 不共享，电脑端必须把手机回传的公开用户信息同步到本机用户表后才能建立登录态。
 * 数据边界：这里只接收公开 User 字段，密码使用随机占位摘要，扫码登录不依赖也不暴露原密码。
 */
export async function adoptUser(user: User): Promise<AuthResult> {
  await delay();
  if (!user || !user.username) {
    return { success: false, message: '账号信息无效' };
  }
  const users = readUsers();
  const found = users.find((u) => u.username === user.username);
  if (found) {
    localStorage.setItem(SESSION_KEY, found.id);
    return { success: true, message: '扫码登录成功', user: toPublicUser(found) };
  }
  // 本机不存在该账号：落库（密码占位，扫码登录不依赖本机密码）。
  const salt = genSalt();
  const placeholder = CryptoJS.lib.WordArray.random(16).toString();
  const stored: StoredUser = {
    id: user.id || genId(),
    username: user.username,
    nickname: user.nickname || user.username,
    avatar: user.avatar || '',
    createdAt: user.createdAt || Date.now(),
    salt,
    passwordHash: hashPassword(placeholder, salt),
  };
  users.push(stored);
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, stored.id);
  return { success: true, message: '扫码登录成功', user: toPublicUser(stored) };
}

/** 退出登录只清除当前会话 id，不删除用户表和历史版本数据。 */
export async function logout(): Promise<void> {
  await delay();
  localStorage.removeItem(SESSION_KEY);
}

/** 根据会话 id 解析当前用户；找不到账号时返回 null，由路由守卫重新要求登录。 */
export async function getCurrentUser(): Promise<User | null> {
  await delay();
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const found = readUsers().find((u) => u.id === id);
  return found ? toPublicUser(found) : null;
}

/** 更新用户资料时只允许改公开资料字段，账号 id、用户名和密码摘要不在此接口修改。 */
export async function updateProfile(
  userId: string,
  profile: Partial<UserProfile>
): Promise<AuthResult> {
  await delay();
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return { success: false, message: '用户不存在' };
  if (profile.nickname !== undefined) users[idx].nickname = profile.nickname.trim();
  if (profile.avatar !== undefined) users[idx].avatar = profile.avatar;
  writeUsers(users);
  return { success: true, message: '资料已更新', user: toPublicUser(users[idx]) };
}

/** 修改密码会重新生成 salt，降低旧摘要被复用的风险。 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<AuthResult> {
  await delay();
  if (!newPassword) return { success: false, message: '新密码不能为空' };
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return { success: false, message: '用户不存在' };
  if (users[idx].passwordHash !== hashPassword(oldPassword, users[idx].salt)) {
    return { success: false, message: '原密码错误' };
  }
  const salt = genSalt();
  users[idx].salt = salt;
  users[idx].passwordHash = hashPassword(newPassword, salt);
  writeUsers(users);
  return { success: true, message: '密码已修改' };
}
