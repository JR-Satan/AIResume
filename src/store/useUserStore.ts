/**
 * 所属小组：3-3 用户模板管理组
 * 编写者：徐崇耀、蔡世强
 * 模块职责：维护前端运行期的用户登录态，统一承接账号密码登录、注册、扫码登录和资料更新。
 * 关键设计：页面只读取 currentUser / isLoggedIn，不直接访问 authService 的本地用户表，降低账号逻辑耦合。
 * 状态约束：每次认证动作成功后同步 currentUser，并将 authReady 置为 true，供强制登录路由判断页面是否可进入。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authService from '../services/authService';
import type { AuthResult, User, UserProfile } from '../types/user';

export const useUserStore = defineStore(
  'user',
  () => {
    // currentUser 是页面判断用户归属和历史版本隔离的唯一前端状态来源。
    const currentUser = ref<User | null>(null);
    const authReady = ref(false);
    const isLoggedIn = computed(() => currentUser.value !== null);

    /**
     * 初始化登录态。
     * 先合并初始账号，再从本地 session 解析当前用户；force 用于注册/扫码后需要重新校验的场景。
     */
    const initAuth = async (force = false) => {
      if (authReady.value && !force) return;
      await authService.ensureUsersInitialized();
      currentUser.value = await authService.getCurrentUser();
      authReady.value = true;
    };

    /** 账号密码登录成功后立即刷新 currentUser，使路由守卫和历史版本面板拿到最新用户名。 */
    const login = async (username: string, password: string): Promise<AuthResult> => {
      await authService.ensureUsersInitialized();
      const res = await authService.login(username, password);
      if (res.success && res.user) currentUser.value = res.user;
      authReady.value = true;
      return res;
    };

    /** 注册成功后沿用 authService 的自动登录结果，避免注册页和登录页维护两套状态写入逻辑。 */
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

    /** 本机扫码登录，按设备版本标识创建或复用本地账号。 */
    const scanLogin = async (versionKey: string): Promise<AuthResult> => {
      await authService.ensureUsersInitialized();
      const res = await authService.scanLogin(versionKey);
      if (res.success && res.user) currentUser.value = res.user;
      authReady.value = true;
      return res;
    };

    /** 电脑端扫码登录收口：采纳手机确认的公开账号信息，并写入本机登录态。 */
    const adoptUser = async (user: User): Promise<AuthResult> => {
      await authService.ensureUsersInitialized();
      const res = await authService.adoptUser(user);
      if (res.success && res.user) currentUser.value = res.user;
      authReady.value = true;
      return res;
    };

    /** 退出只清空当前登录态，保留本地账号表和各用户历史版本数据。 */
    const logout = async () => {
      await authService.logout();
      currentUser.value = null;
      authReady.value = true;
    };

    /** 资料更新成功后同步 currentUser，保证页面头像/昵称无需刷新即可更新。 */
    const updateProfile = async (profile: Partial<UserProfile>): Promise<AuthResult> => {
      if (!currentUser.value) return { success: false, message: '未登录' };
      const res = await authService.updateProfile(currentUser.value.id, profile);
      if (res.success && res.user) currentUser.value = res.user;
      return res;
    };

    /** 修改密码不改变 currentUser 公开资料，只返回认证服务的校验结果。 */
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
      scanLogin,
      adoptUser,
      logout,
      updateProfile,
      changePassword,
    };
  },
  {
    persist: true, // 开启持久化存储
  }
);
