import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './auth';
import Dashboard from './views/Dashboard.vue';
import Providers from './views/Providers.vue';
import ProviderKeys from './views/ProviderKeys.vue';
import Logs from './views/Logs.vue';
import Settings from './views/Settings.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { requiresAuth: false } },
    {
      path: '/',
      component: () => import('./views/Home.vue'),
      children: [
        { path: '', redirect: 'dashboard' },
        { path: 'dashboard', name: 'dashboard', component: Dashboard },
        { path: 'providers', name: 'providers', component: Providers },
        { path: 'providers/:name/keys', name: 'provider-keys', component: ProviderKeys },
        { path: 'logs', name: 'logs', component: Logs },
        { path: 'settings', name: 'settings', component: Settings },
      ]
    },
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
