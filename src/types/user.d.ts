// 用户相关类型定义

// 用户可编辑的基础资料
export interface UserProfile {
  nickname: string;
  avatar: string;
}

// 对外暴露的用户信息（不含密码）
export interface User extends UserProfile {
  id: string;
  username: string;
  createdAt: number;
}

// 内部存储的用户记录（含密码哈希与盐值，仅 service 层使用）
export interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}

// 认证操作的统一返回结构
export interface AuthResult {
  success: boolean;
  message: string;
  user?: User;
}
