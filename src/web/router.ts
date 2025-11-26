import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { requiresAuth: false } },
    { path: '/', name: 'home', component: () => import('./views/Home.vue') },
  ],
});

router.beforeEach((to) => {
  const token = getToken();

  if (to.name === 'login') {
    return token ? { path: '/' } : true;
  }

  if (to.meta?.requiresAuth === false) {
    return true;
  }

  if (!token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
