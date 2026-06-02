// 认证服务层（数据访问抽象）
//
// 本文件是「用户/认证」的唯一数据访问入口，当前用 localStorage 实现。
// 将来对接真实后端时，只需把每个方法内部替换为 fetch 请求，
// 上层（store / 页面）的调用方式无需改动 —— 这就是预留的接口层。
import CryptoJS from 'crypto-js';
import type { AuthResult, StoredUser, User, UserProfile } from '../types/user';

// localStorage 存储键
const USERS_KEY = 'ai_resume_users'; // 用户表（StoredUser[]）
const SESSION_KEY = 'ai_resume_session'; // 当前登录用户 id

// 模拟异步，便于将来无缝替换为真实网络请求
const delay = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 读取 / 写入用户表
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

// 从 public/users.json 合并初始账号。运行时新增/改密仍保存到 localStorage 的 JSON 用户表。
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

// 生成随机盐值
const genSalt = () => CryptoJS.lib.WordArray.random(16).toString();

// 密码哈希：SHA256(password + salt)，不存明文
const hashPassword = (password: string, salt: string) =>
  CryptoJS.SHA256(password + salt).toString();

// 生成用户 id（时间戳 + 随机串，足够本地唯一）
const genId = () =>
  `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 去除密码字段，得到对外可用的 User
const toPublicUser = (u: StoredUser): User => {
  const { passwordHash, salt, ...pub } = u;
  return pub;
};

// 注册
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

// 登录
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

// 退出登录
export async function logout(): Promise<void> {
  await delay();
  localStorage.removeItem(SESSION_KEY);
}

// 获取当前登录用户（无则返回 null）
export async function getCurrentUser(): Promise<User | null> {
  await delay();
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const found = readUsers().find((u) => u.id === id);
  return found ? toPublicUser(found) : null;
}

// 更新基础资料（昵称 / 头像）
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

// 修改密码
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
