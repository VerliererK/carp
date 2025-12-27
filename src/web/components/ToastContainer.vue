<script setup lang="ts">
import { useToast } from '../composables/useToast';
import { Icon } from '@iconify/vue';

const { toasts, remove } = useToast();

const getIcon = (type: string) => {
  switch (type) {
    case 'success': return 'heroicons:check-circle-20-solid';
    case 'error': return 'heroicons:x-circle-20-solid';
    case 'warning': return 'heroicons:exclamation-triangle-20-solid';
    default: return 'heroicons:information-circle-20-solid';
  }
};
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none p-4">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id"
        class="pointer-events-auto relative flex items-start gap-3 p-4 pr-10 rounded-2xl border shadow-float backdrop-blur-md transition-all duration-300"
        :class="[
          toast.type === 'success' && 'bg-status-success border-status-success-border text-status-success-text',
          toast.type === 'error' && 'bg-status-error border-status-error-border text-status-error-text',
          toast.type === 'warning' && 'bg-status-warning border-status-warning-border text-status-warning-text',
          toast.type === 'info' && 'bg-card border-border-subtle text-text-primary'
        ]" role="alert">
        <Icon :icon="getIcon(toast.type)" class="w-5 h-5 mt-0.5 flex-shrink-0" />

        <p class="text-sm font-medium leading-5 break-words line-clamp-3">
          {{ toast.message }}
        </p>

        <button @click="remove(toast.id)"
          class="absolute top-3 right-3 p-1 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 transition-opacity"
          aria-label="Close">
          <Icon icon="heroicons:x-mark-20-solid" class="w-5 h-5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease-out;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
