<template>
  <div class="profile-page">
    <!-- 已登录 -->
    <div v-if="userStore.isLoggedIn" class="profile-card">
      <h2 class="profile-title">个人中心</h2>

      <div class="profile-meta">
        <!-- 点击头像上传图片 -->
        <div class="avatar-uploader" @click="triggerUpload" title="点击更换头像">
          <a-avatar :size="64" :src="userStore.currentUser?.avatar || undefined">
            {{ (userStore.currentUser?.nickname || 'U').charAt(0).toUpperCase() }}
          </a-avatar>
          <span class="avatar-uploader-mask">更换</span>
        </div>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="handleAvatarChange" />
        <div class="profile-meta-text">
          <div class="profile-nickname">{{ userStore.currentUser?.nickname }}</div>
          <div class="profile-username">@{{ userStore.currentUser?.username }}</div>
        </div>
      </div>

      <!-- 基础资料 -->
      <a-form layout="vertical" :model="profileForm" @finish="handleUpdateProfile">
        <a-form-item label="昵称" name="nickname">
          <a-input v-model:value="profileForm.nickname" placeholder="请输入昵称" />
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="savingProfile">保存资料</a-button>
      </a-form>

      <a-divider />

      <!-- 修改密码 -->
      <h3 class="profile-subtitle">修改密码</h3>
      <a-form layout="vertical" :model="pwdForm" @finish="handleChangePassword">
        <a-form-item label="原密码" name="oldPassword"
          :rules="[{ required: true, message: '请输入原密码' }]">
          <a-input-password v-model:value="pwdForm.oldPassword" placeholder="请输入原密码" />
        </a-form-item>
        <a-form-item label="新密码" name="newPassword"
          :rules="[{ required: true, message: '请输入新密码' }]">
          <a-input-password v-model:value="pwdForm.newPassword" placeholder="请输入新密码" />
        </a-form-item>
        <a-button type="primary" html-type="submit" :loading="savingPwd">确认修改</a-button>
      </a-form>

      <a-divider />

      <a-button danger block @click="handleLogout">退出登录</a-button>
    </div>

    <!-- 未登录 -->
    <div v-else class="profile-card profile-empty">
      <p>你还没有登录</p>
      <a-button type="primary" @click="router.push('/auth')">去登录 / 注册</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useUserStore } from '../../store/useUserStore';

const router = useRouter();
const userStore = useUserStore();

const profileForm = reactive({ nickname: '' });
const pwdForm = reactive({ oldPassword: '', newPassword: '' });
const savingProfile = ref(false);
const savingPwd = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// 用当前用户信息回填资料表单
watchEffect(() => {
  profileForm.nickname = userStore.currentUser?.nickname || '';
});

// 点击头像触发文件选择
const triggerUpload = () => {
  fileInput.value?.click();
};

// 选中图片后转为 base64 并立即保存为头像
const handleAvatarChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    message.error('请选择图片文件');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    message.error('图片不能超过 2MB');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const res = await userStore.updateProfile({ avatar: reader.result as string });
    res.success ? message.success('头像已更新') : message.error(res.message);
  };
  reader.readAsDataURL(file);
  input.value = ''; // 允许重复选择同一文件
};

const handleUpdateProfile = async () => {
  savingProfile.value = true;
  try {
    const res = await userStore.updateProfile({
      nickname: profileForm.nickname,
    });
    res.success ? message.success(res.message) : message.error(res.message);
  } finally {
    savingProfile.value = false;
  }
};

const handleChangePassword = async () => {
  savingPwd.value = true;
  try {
    const res = await userStore.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    if (res.success) {
      message.success(res.message);
      pwdForm.oldPassword = '';
      pwdForm.newPassword = '';
    } else {
      message.error(res.message);
    }
  } finally {
    savingPwd.value = false;
  }
};

const handleLogout = async () => {
  await userStore.logout();
  message.success('已退出登录');
  router.push('/');
};
</script>

<style scoped>
.profile-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 16px;
  min-height: 100%;
  background: #f5f6fa;
}

.profile-card {
  width: 100%;
  max-width: 460px;
  padding: 28px 32px 36px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.profile-title {
  text-align: center;
  margin: 4px 0 20px;
  color: var(--primary-color);
}

.profile-subtitle {
  margin: 4px 0 12px;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

/* 可点击上传的头像 */
.avatar-uploader {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-uploader-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-uploader:hover .avatar-uploader-mask {
  opacity: 1;
}

.profile-nickname {
  font-size: 18px;
  font-weight: 600;
}

.profile-username {
  color: #999;
  font-size: 13px;
}

.profile-empty {
  text-align: center;
}

.profile-empty p {
  margin-bottom: 16px;
  color: #999;
}
</style>
