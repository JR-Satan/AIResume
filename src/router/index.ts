import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useUserStore } from '../store/useUserStore';


// 定义路由
const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'resume',
    component: () => import('@/views/resume/index.vue'),
    meta: { title: 'AI简历 - 简历制作' }
  },
  {
    path: '/resumeDesign',
    name: 'resumeDesign',
    component: () => import('@/views/resumeDesign/index.vue'),
    meta: { title: 'AI简历 - 简历设计' }
  },
  {
    path: '/template',
    name: 'template',
    component: () => import('@/views/template/index.vue'),
    meta: { title: 'AI简历 - 简历模板' }
  },
  {
    path: '/setting',
    name: 'setting',
    component: () => import('@/views/setting/index.vue'),
    meta: { title: 'AI简历 - 网站配置' }
  },
  {
    path: '/aiDeep',
    name: 'aiDeep',
    component: () => import('@/views/aiDeep/index.vue'),
    meta: { title: 'AI简历 - AI深度交流', keepAlive: true }
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/auth/index.vue'),
    meta: { title: 'AI简历 - 登录', public: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/profile/index.vue'),
    meta: { title: 'AI简历 - 个人中心' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/404.vue')
  }
];

// 创建路由实例
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 使用 HTML5 历史模式
  routes
});
router.afterEach((to) => {
  document.title = (to.meta?.title as string) || '默认标题';
});

router.beforeEach(async (to) => {
  const userStore = useUserStore();
  await userStore.initAuth();

  const isPublicRoute = to.meta.public === true;
  const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/';
  // 带 scan 会话参数的 /auth 访问是「手机扫码回传」流程：
  // 即使本机已登录，也要停在扫码页把账号回传给电脑，不能按已登录踢回首页。
  const isScanFlow = to.name === 'auth' && typeof to.query.scan === 'string' && to.query.scan !== '';

  if (userStore.isLoggedIn && to.name === 'auth' && !isScanFlow) {
    return redirect === '/auth' ? '/' : redirect;
  }

  if (!isPublicRoute && !userStore.isLoggedIn) {
    return {
      name: 'auth',
      query: { redirect: to.fullPath },
    };
  }

  return true;
});

export default router;
