import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authService from '../services/authService';
import type { AuthResult, User, UserProfile } from '../types/user';

export const useUserStore = defineStore(
  'user',
  () => {
    // 当前登录用户（未登录为 null）
    const currentUser = ref<User | null>(null);
    const authReady = ref(false);
    // 是否已登录
    const isLoggedIn = computed(() => currentUser.value !== null);

    const initAuth = async (force = false) => {
      if (authReady.value && !force) return;
      await authService.ensureUsersInitialized();
      currentUser.value = await authService.getCurrentUser();
      authReady.value = true;
    };

    // 登录
    const login = async (username: string, password: string): Promise<AuthResult> => {
      await authService.ensureUsersInitialized();
      const res = await authService.login(username, password);
      if (res.success && res.user) currentUser.value = res.user;
      authReady.value = true;
      return res;
    };

    // 注册（成功后自动登录）
    const register = async (
      username: string,
      password: string,
      profile?: Partial<UserProfile>
    ): Promise<AuthResult> => {
      await authService.ensureUsersInitialized();
      const res = await authService.register(username, password, profile);
      if (res.success && res.user) currentUser.value = res.user;
      authReady.value = true;
      return res;
    };

    // 退出登录
    const logout = async () => {
      await authService.logout();
      currentUser.value = null;
      authReady.value = true;
    };

    // 更新基础资料
    const updateProfile = async (profile: Partial<UserProfile>): Promise<AuthResult> => {
      if (!currentUser.value) return { success: false, message: '未登录' };
      const res = await authService.updateProfile(currentUser.value.id, profile);
      if (res.success && res.user) currentUser.value = res.user;
      return res;
    };

    // 修改密码
    const changePassword = async (
      oldPassword: string,
      newPassword: string
    ): Promise<AuthResult> => {
      if (!currentUser.value) return { success: false, message: '未登录' };
      return authService.changePassword(currentUser.value.id, oldPassword, newPassword);
    };

    return {
      currentUser,
      authReady,
      isLoggedIn,
      initAuth,
      login,
      register,
      logout,
      updateProfile,
      changePassword,
    };
  },
  {
    persist: true, // 开启持久化存储
  }
);
