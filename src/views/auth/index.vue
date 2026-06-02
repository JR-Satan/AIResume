<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2 class="auth-title">AI简历</h2>

      <!-- 手机端：只显示扫码登录界面 -->
      <div v-if="isMobileScan" class="scan-mobile">
        <p class="scan-tip">检测到设备：</p>
        <p class="scan-version">{{ device.versionKey }}</p>
        <a-button type="primary" block :loading="loading" :disabled="scanDone" @click="handleMobileConfirm">
          {{ scanDone ? '登录成功' : '确认登录' }}
        </a-button>
        <p class="scan-hint">
          {{ scanDone ? (sessionId ? '电脑端将自动登录，可关闭本页' : '已在本机登录') : '同一设备版本将始终登录同一账号' }}
        </p>
      </div>

      <!-- 电脑端：账密 / 注册 / 扫码 三个 Tab -->
      <a-tabs v-else v-model:activeKey="activeTab" centered>
        <!-- 登录 -->
        <a-tab-pane key="login" tab="登录">
          <a-form layout="vertical" :model="loginForm" @finish="handleLogin">
            <a-form-item label="用户名" name="username"
              :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input v-model:value="loginForm.username" placeholder="请输入用户名" />
            </a-form-item>
            <a-form-item label="密码" name="password"
              :rules="[{ required: true, message: '请输入密码' }]">
              <a-input-password v-model:value="loginForm.password" placeholder="请输入密码" />
            </a-form-item>
            <a-button type="primary" html-type="submit" block :loading="loading">登录</a-button>
          </a-form>
        </a-tab-pane>

        <!-- 注册 -->
        <a-tab-pane key="register" tab="注册">
          <a-form layout="vertical" :model="registerForm" @finish="handleRegister">
            <a-form-item label="用户名" name="username"
              :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input v-model:value="registerForm.username" placeholder="请输入用户名" />
            </a-form-item>
            <a-form-item label="昵称" name="nickname">
              <a-input v-model:value="registerForm.nickname" placeholder="选填，默认与用户名相同" />
            </a-form-item>
            <a-form-item label="密码" name="password"
              :rules="[{ required: true, message: '请输入密码' }]">
              <a-input-password v-model:value="registerForm.password" placeholder="请输入密码" />
            </a-form-item>
            <a-form-item label="确认密码" name="confirm"
              :rules="[{ required: true, message: '请再次输入密码' }]">
              <a-input-password v-model:value="registerForm.confirm" placeholder="请再次输入密码" />
            </a-form-item>
            <a-button type="primary" html-type="submit" block :loading="loading">注册</a-button>
          </a-form>
        </a-tab-pane>

        <!-- 扫码登录：展示局域网二维码，引导手机扫码 -->
        <a-tab-pane key="scan" tab="扫码登录">
          <div class="scan-pc">
            <div class="scan-qr">
              <img v-if="qrDataUrl" :src="qrDataUrl" alt="扫码登录二维码" />
              <a-spin v-else />
            </div>
            <p class="scan-tip">请使用手机扫码，在同一局域网下打开本站</p>
            <p class="scan-hint">手机确认后，本机将自动登录</p>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import QRCode from 'qrcode';
import { useUserStore } from '../../store/useUserStore';
import { parseDeviceInfo } from '../../utils/deviceInfo';
import { confirmSession, createSession, pollSession } from '../../services/scanService';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const activeTab = ref<'login' | 'register' | 'scan'>('login');
const loading = ref(false);

// 当前设备信息
const device = reactive(parseDeviceInfo());
// URL 上的扫码会话 id（手机由电脑二维码带入；电脑端为空）。
// 用 computed 跟随路由：第二次扫不同的码时 scan 参数会变，需要同步。
const sessionId = computed(() =>
  typeof route.query.scan === 'string' ? route.query.scan : ''
);
// 手机端模式：移动设备，或带了扫码会话 id（扫码打开）。此时只显示扫码界面。
const isMobileScan = computed(() => device.isMobile || !!sessionId.value);
// 手机端是否已完成确认
const scanDone = ref(false);

// 第二次扫不同的二维码（scan 会话变了）→ 重置确认状态，让按钮恢复可点。
watch(sessionId, () => {
  scanDone.value = false;
});

const qrDataUrl = ref('');
let pollTimer: ReturnType<typeof setInterval> | null = null;

const loginForm = reactive({ username: '', password: '' });
const registerForm = reactive({ username: '', nickname: '', password: '', confirm: '' });

const getRedirectPath = () => {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && redirect !== '/auth' ? redirect : '/';
};

const handleLogin = async () => {
  loading.value = true;
  try {
    const res = await userStore.login(loginForm.username, loginForm.password);
    if (res.success) {
      message.success(res.message);
      router.replace(getRedirectPath());
    } else {
      message.error(res.message);
    }
  } finally {
    loading.value = false;
  }
};

const handleRegister = async () => {
  if (registerForm.password !== registerForm.confirm) {
    message.error('两次输入的密码不一致');
    return;
  }
  loading.value = true;
  try {
    const res = await userStore.register(registerForm.username, registerForm.password, {
      nickname: registerForm.nickname,
    });
    if (res.success) {
      message.success(res.message);
      router.replace(getRedirectPath());
    } else {
      message.error(res.message);
    }
  } finally {
    loading.value = false;
  }
};

// 手机端：确认登录 —— 本机按设备版本登录，并把账号回传给电脑会话
const handleMobileConfirm = async () => {
  loading.value = true;
  try {
    const res = await userStore.scanLogin(device.versionKey);
    if (!res.success || !res.user) {
      message.error(res.message);
      return;
    }
    // 带了会话 id（电脑发起的扫码）→ 回传账号，让电脑自动登录
    if (sessionId.value) {
      const ok = await confirmSession(sessionId.value, res.user);
      if (!ok) {
        message.warning('已在本机登录，但电脑端会话已过期');
      } else {
        message.success('确认成功，电脑端将自动登录');
      }
      scanDone.value = true;
    } else {
      // 直接在手机访问站点（无会话）→ 就在手机本机登录跳转
      message.success(res.message);
      router.replace(getRedirectPath());
    }
  } finally {
    loading.value = false;
  }
};

// 电脑端：创建会话 → 生成带会话 id 的二维码 → 轮询直到手机确认
const startPcScanFlow = async () => {
  try {
    const id = await createSession();
    // 二维码编码：当前站点的 /auth 页 + scan 会话参数；手机扫码打开后自动进入扫码模式
    const url = `${window.location.origin}/auth?scan=${encodeURIComponent(id)}`;
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 200, margin: 1 });

    pollTimer = setInterval(async () => {
      const result = await pollSession(id);
      if (result.status === 'confirmed' && result.user) {
        stopPoll();
        const res = await userStore.adoptUser(result.user);
        if (res.success) {
          message.success('扫码登录成功');
          router.replace(getRedirectPath());
        } else {
          message.error(res.message);
        }
      } else if (result.status === 'expired') {
        stopPoll();
        message.warning('二维码已过期，请刷新页面重试');
      }
    }, 1500);
  } catch (e) {
    console.error('扫码登录初始化失败:', e);
  }
};

const stopPoll = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onMounted(() => {
  // 仅电脑端发起扫码会话与轮询；手机端不需要
  if (!isMobileScan.value) startPcScanFlow();
});

onBeforeUnmount(stopPoll);
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 60px 16px;
  min-height: 100%;
  background: #f5f6fa;
}

.auth-card {
  width: 100%;
  max-width: 380px;
  padding: 28px 32px 36px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.auth-title {
  text-align: center;
  margin: 4px 0 8px;
  color: var(--primary-color);
}

.scan-mobile,
.scan-pc {
  text-align: center;
  padding: 8px 0 4px;
}

.scan-qr {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  margin-bottom: 12px;
}

.scan-qr img {
  width: 200px;
  height: 200px;
}

.scan-tip {
  margin: 4px 0;
  color: rgba(0, 0, 0, 0.65);
}

.scan-version {
  margin: 4px 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-color);
}

.scan-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
