<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { isDark, toggleTheme } from '@/theme';
</script>

<template>
  <button @click="toggleTheme"
    class="p-2.5 rounded-full text-text-secondary bg-app border border-border-subtle hover:bg-card-hover hover:text-text-primary transition duration-200 active:scale-95 cursor-pointer"
    :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'" aria-label="Toggle Dark Mode">
    <Icon v-if="isDark" icon="lucide:sun" class="h-5 w-5" />
    <Icon v-else icon="lucide:moon" class="h-5 w-5" />
  </button>
</template>
