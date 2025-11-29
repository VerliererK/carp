<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { removeToken } from '@/auth';
import Logo from '@/components/Logo.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';

const router = useRouter();
const route = useRoute();
const isSidebarOpen = ref(false);

const menuItems = [
  { name: 'Dashboard', key: 'dashboard', icon: 'lucide:bar-chart-3' },
  { name: 'Providers', key: 'providers', icon: 'lucide:network' },
  { name: 'Logs', key: 'logs', icon: 'lucide:file-text' },
  { name: 'Settings', key: 'settings', icon: 'lucide:settings' },
];

watch(
  () => route.fullPath,
  () => {
    isSidebarOpen.value = false;
  }
);

const handleLogout = () => {
  removeToken();
  router.push({ name: 'login' });
};

const navigateTo = (key: string) => {
  router.push({ name: key });
};
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-app text-text-primary">
    <!-- Mobile Backdrop -->
    <Transition enter-active-class="transition-opacity duration-300 ease-out" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isSidebarOpen" class="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] md:hidden"
        @click="isSidebarOpen = false"></div>
    </Transition>

    <!-- Sidebar -->
    <aside
      class="sidebar-panel fixed inset-y-0 left-0 z-50 flex flex-col w-54 shrink-0 bg-card border-r border-border-subtle shadow-2xl md:shadow-none md:relative md:translate-x-0 md:transition-none"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'">
      <div class="flex justify-between items-center px-3 py-3 border-b border-border-subtle">
        <div class="flex gap-4 items-center">
          <Logo />
          <span class="text-xl font-bold">CARP</span>
        </div>
        <ThemeToggle />
      </div>

      <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        <div v-for="item in menuItems" :key="item.key" @click="navigateTo(item.key)"
          class="px-3 py-2 rounded-lg cursor-pointer transition-colors font-medium flex items-center gap-3 hover:bg-card-hover hover:text-text-primary"
          :class="route.name === item.key ? 'bg-card-hover text-text-primary' : 'text-text-secondary'">
          <Icon :icon="item.icon" class="w-5 h-5" />
          <span>{{ item.name }}</span>
        </div>
      </nav>

      <div class="p-3 flex">
        <button type="button" @click="handleLogout"
          class="inline-flex items-center justify-center p-2.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors cursor-pointer">
          <Icon icon="lucide:log-out" class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="relative flex flex-col flex-1 w-full min-w-0 bg-app">
      <!-- Mobile Header -->
      <header
        class="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-card md:hidden shrink-0">
        <div class="flex items-center gap-3">
          <button @click="isSidebarOpen = true"
            class="text-text-secondary hover:text-text-primary p-1 -ml-1 rounded-md">
            <Icon icon="lucide:menu" class="w-6 h-6" />
          </button>
        </div>
        <ThemeToggle />
      </header>

      <div class="flex-1 overflow-y-auto p-4 md:p-8">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.sidebar-panel {
  transition-property: translate, background-color, border-color;
  transition-duration: 300ms, 300ms, 300ms;
  transition-timing-function: cubic-bezier(0.25, 0.8, 0.5, 1), ease, ease;
  will-change: translate;
}
</style>
