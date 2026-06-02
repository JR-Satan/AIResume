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
</template>

<script setup lang="ts">
import { computed } from "vue";
import SvgIcon from '../SvgIcon.vue';
import { useUserStore } from "../../store/useUserStore";

const userStore = useUserStore();

// 头像占位文字：已登录取昵称首字，未登录显示默认图标占位
const avatarText = computed(() =>
  userStore.isLoggedIn ? (userStore.currentUser?.nickname || 'U').charAt(0).toUpperCase() : '👤'
);
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
