<template>
  <header class="navbar">
    <nav>
      <ul>
        <li><router-link to="/">
            <SvgIcon iconName="resume" />
            简历制作
          </router-link></li>
        <li ref="templateStore"><router-link to="/template">
            <SvgIcon iconName="templateStore" />
            模板市场
          </router-link></li>
        <li ref="setting"><router-link to="/aiDeep">
            <SvgIcon iconName="ai" />
            AI深度交流
          </router-link></li>
        <li ref="setting"><router-link to="/setting">
            <SvgIcon iconName="setting" />
            网站配置
          </router-link></li>

        <li><router-link to="/resumeDesign">简历模板设计</router-link></li>

        <!-- 登录入口（最右侧 + 圆形头像标记）：未登录跳登录页，已登录跳个人中心 -->
        <li class="user-entry">
          <router-link :to="userStore.isLoggedIn ? '/profile' : '/auth'">
            <a-avatar :size="30" :src="userStore.currentUser?.avatar || undefined" class="user-avatar">
              {{ avatarText }}
            </a-avatar>
            <span class="user-entry-text">
              {{ userStore.isLoggedIn ? userStore.currentUser?.nickname : '登录/注册' }}
            </span>
          </router-link>
        </li>
      </ul>
    </nav>
  </header>

  <!-- 漫游式引导 -->
  <a-tour v-model:open="tourOpen" :steps="tourSteps" :mask="true" :next-button-props="{ children: '下一步' }"
    :prev-button-props="{ children: '上一步' }" :finish-button-props="{ children: '完成' }" @finish="handleFinish"
    @close="handleFinish" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import SvgIcon from '../SvgIcon.vue';
import { useResumeStore } from "../../store/useResumeStore";
import { useUserStore } from "../../store/useUserStore";
import type { TourProps } from 'ant-design-vue';

const store = useResumeStore();
const userStore = useUserStore();
const setting = ref(null);
const templateStore = ref(null);
const tourOpen = ref(false); // 控制引导是否打开

// 头像占位文字：已登录取昵称首字，未登录显示默认图标占位
const avatarText = computed(() =>
  userStore.isLoggedIn ? (userStore.currentUser?.nickname || 'U').charAt(0).toUpperCase() : '👤'
);

const tourSteps: TourProps['steps'] = [
  {
    title: "网站配置",
    description: "请先进入网站配置，完善基本信息（否则无法使用大模型润色！）",
    target: () => setting.value,
  },
  {
    title: "选择模板",
    description: "然后进入模板市场，挑选适合你的简历模板。",
    target: () => templateStore.value,
  }
];



// 引导完成时的回调
const handleFinish = () => {
  tourOpen.value = false;
};

onMounted(() => {
  if (store.isFirstVisit) {
    tourOpen.value = true; // 开始引导
  }
});
</script>

<style scoped>
.navbar {
  background: linear-gradient(to right, var(--color-5), var(--color-6), var(--color-5));
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.navbar nav {
  width: 100%;
}

.navbar nav ul {
  list-style-type: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

/* 登录入口推到整行最右侧*/
.navbar nav ul li.user-entry {
  position: absolute;
  right: 0;
}

.navbar nav ul li a {
  display: block;
  color: white;
  text-align: center;
  font-size: 17px;
  padding: 17px 16px;
  text-decoration: none;
  transition: all 0.22s;
}

.navbar nav ul li a:hover {
  background-color: #ffffff;
  color: black;
}

/* 登录入口：头像 + 文字横向排列 */
.navbar nav ul li.user-entry a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.user-avatar {
  background-color: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
}

.user-entry-text {
  font-size: 15px;
}
</style>
