<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2 class="auth-title">AI简历</h2>
      <a-tabs v-model:activeKey="activeTab" centered>
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
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useUserStore } from '../../store/useUserStore';

const router = useRouter();
const userStore = useUserStore();

const activeTab = ref<'login' | 'register'>('login');
const loading = ref(false);

const loginForm = reactive({ username: '', password: '' });
const registerForm = reactive({ username: '', nickname: '', password: '', confirm: '' });

const handleLogin = async () => {
  loading.value = true;
  try {
    const res = await userStore.login(loginForm.username, loginForm.password);
    if (res.success) {
      message.success(res.message);
      router.push('/');
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
      router.push('/');
    } else {
      message.error(res.message);
    }
  } finally {
    loading.value = false;
  }
};
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
</style>
