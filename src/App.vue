<script setup lang="ts">
import Header from "./components/Header/index.vue";
import ThemeSwitcher from './components/ThemeSwitcher/index.vue';
import NarrowScreen from './components/narrow/index.vue';
import { useResumeStore } from './store/useResumeStore';
import { useSettingsStore } from './store/useSettingsStore';
import { computed, onMounted, ref, onBeforeMount, watch } from 'vue';
import { useRoute } from 'vue-router';
const settingsStore = useSettingsStore();
const showNarrowScreen = ref(false);
const route = useRoute();
const isAuthPage = computed(() => route.name === 'auth');
const shouldInitializeResume = computed(() => route.name !== undefined && route.name !== 'auth');
const resumeStore = useResumeStore();


// 检查屏幕宽度
const checkScreenWidth = () => {
  showNarrowScreen.value = window.innerWidth < 768;
};

onBeforeMount(() => {
  checkScreenWidth();
  window.addEventListener('resize', checkScreenWidth);
});

// 页面加载时初始化
onMounted(() => {
  settingsStore.initTheme();
});

watch(
  shouldInitializeResume,
  async (shouldInit) => {
    if (shouldInit) {
      await resumeStore.initCheck();
    }
  },
  { immediate: true }
);
</script>

<template>
  <narrow-screen v-if="showNarrowScreen" />
  <template v-else>
    <Header v-if="!isAuthPage" />
    <a-config-provider :theme="{
      token: {
        colorPrimary: settingsStore.theme,
      },
    }">
      <router-view v-slot="{ Component }">
        <keep-alive include="aiDeep">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </a-config-provider>
    <ThemeSwitcher v-if="!isAuthPage" />
  </template>
</template>


<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
