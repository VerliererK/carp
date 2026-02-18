<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { Model } from '@shared/types';

defineProps<{
  model: Model & { mappings_count: number };
}>();

defineEmits<{
  (e: 'toggle', name: string): void;
  (e: 'edit', name: string): void;
  (e: 'delete', name: string): void;
}>();
</script>

<template>
  <div
    class="group flex flex-col sm:flex-row items-start sm:items-center justify-between bg-card border border-border-subtle rounded-xl p-4 shadow-float hover:border-border-focus transition-all duration-200 ease-out gap-4">

    <!-- Left Section: Info -->
    <div class="flex items-center gap-4 flex-1 min-w-0 w-full sm:w-auto">
      <!-- Status Indicator -->
      <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300"
        :class="model.enabled ? 'bg-status-success-text' : 'bg-border-subtle'"></div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="text-base font-semibold text-text-primary truncate leading-tight">{{ model.name }}</h3>
        </div>

        <div class="flex items-center gap-1.5 mt-1.5 opacity-80" title="Mappings">
          <Icon icon="lucide:route" class="w-3 h-3 text-text-tertiary" />
          <span class="text-xs font-mno font-medium text-text-secondary mr-2">{{ model.mappings_count }}
            mappings</span>
        </div>
      </div>
    </div>

    <!-- Right Section: Actions -->
    <div
      class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-border-subtle pt-3 sm:pt-0 mt-1 sm:mt-0">

      <div class="flex items-center gap-2 ml-2">
        <button @click.stop="$emit('toggle', model.name)"
          class="p-2.5 rounded-full transition-colors cursor-pointer hover:bg-card-hover"
          :class="model.enabled ? 'text-status-success-text hover:text-status-success-text' : 'text-text-tertiary hover:text-text-primary'"
          :title="model.enabled ? 'Disable' : 'Enable'" :aria-label="model.enabled ? 'Disable model' : 'Enable model'">
          <Icon :icon="model.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="w-5 h-5" />
        </button>

        <button @click.stop="$emit('edit', model.name)"
          class="p-2.5 rounded-full text-text-secondary cursor-pointer hover:text-brand-primary hover:bg-card-hover transition-colors"
          title="Edit" aria-label="Edit model">
          <Icon icon="lucide:pencil" class="w-4.5 h-4.5" />
        </button>
        <button @click.stop="$emit('delete', model.name)"
          class="p-2.5 rounded-full text-status-error-text cursor-pointer hover:bg-card-hover transition-colors"
          title="Delete" aria-label="Delete model">
          <Icon icon="lucide:trash-2" class="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  </div>
</template>
