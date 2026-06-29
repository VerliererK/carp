<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { ProviderWithKeyCounts } from '@shared/types';

defineProps<{ provider: ProviderWithKeyCounts }>();

defineEmits<{
  (e: 'toggle', id: number): void;
  (e: 'edit', id: number): void;
  (e: 'delete', id: number): void;
}>();
</script>

<template>
  <div
    class="group flex flex-col md:flex-row md:items-center md:justify-between bg-card border border-border-subtle rounded-xl p-4 shadow-float hover:border-border-focus transition-all duration-200 ease-out gap-3 cursor-pointer md:border-0 md:rounded-none md:shadow-none md:px-5 md:py-4 md:min-h-16 md:hover:bg-card-hover/50">
    <div class="flex items-center gap-4 min-w-0">
      <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300"
        :class="provider.enabled ? 'bg-status-success-text' : 'bg-border-subtle'"></div>
      <h3 class="text-base font-semibold text-text-primary truncate leading-tight">{{ provider.name }}</h3>
    </div>

    <div
      class="flex items-center justify-between md:justify-end gap-4 border-t border-border-subtle pt-3 md:border-t-0 md:pt-0 md:shrink-0">
      <div class="flex items-center gap-4 md:gap-5">
        <div class="flex items-center gap-1.5" title="Total keys">
          <Icon icon="lucide:key" class="w-3.5 h-3.5 md:w-4 md:h-4 text-text-tertiary" />
          <span class="font-mono text-sm font-semibold text-text-secondary">{{ provider.keys_count }}</span>
        </div>

        <div v-if="provider.invalid_key_count > 0" class="flex items-center gap-1.5" title="Invalid keys">
          <Icon icon="lucide:triangle-alert" class="w-3.5 h-3.5 md:w-4 md:h-4 text-status-error-text" />
          <span class="font-mono text-sm font-semibold text-status-error-text">{{ provider.invalid_key_count }}</span>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <button @click.stop="$emit('toggle', provider.id)"
          class="p-2 rounded-full hover:bg-card-hover cursor-pointer transition-colors"
          :class="provider.enabled ? 'text-status-success-text hover:text-status-success-text' : 'text-text-tertiary hover:text-text-primary'"
          :title="provider.enabled ? 'Disable' : 'Enable'"
          :aria-label="provider.enabled ? 'Disable provider' : 'Enable provider'">
          <Icon :icon="provider.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="w-5 h-5" />
        </button>

        <button @click.stop="$emit('edit', provider.id)"
          class="p-2 rounded-full text-text-secondary hover:text-brand hover:bg-card-hover cursor-pointer transition-colors"
          title="Edit" aria-label="Edit provider">
          <Icon icon="lucide:pencil" class="w-4.5 h-4.5" />
        </button>
        <button @click.stop="$emit('delete', provider.id)"
          class="p-2 rounded-full text-status-error-text hover:text-status-error-text hover:bg-card-hover cursor-pointer transition-colors"
          title="Delete" aria-label="Delete provider">
          <Icon icon="lucide:trash-2" class="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  </div>
</template>
