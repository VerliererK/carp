<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  modelValue: boolean;
  title?: string;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'close'): void;
}>();

const close = () => {
  emit('update:modelValue', false);
  emit('close');
};
</script>

<template>
  <teleport to="body">
    <Transition enter-active-class="base-modal-transition" enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="base-modal-transition" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="close"></div>

        <!-- Content -->
        <div class="relative z-10 mx-4 w-full max-w-lg rounded-2xl bg-card shadow-float p-6" role="dialog"
          aria-modal="true" :aria-label="title">
          <div class="flex items-center gap-3 mb-4">
            <h2 v-if="title" class="text-lg font-semibold text-text-primary">
              {{ title }}
            </h2>
            <button type="button"
              class="ml-auto p-2 rounded-full text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer"
              @click="close" aria-label="close">
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>

          <div class="text-text-secondary">
            <slot></slot>
          </div>

          <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<style scoped>
.base-modal-transition {
  transition: opacity 0.2s ease-out, background-color 0.3s ease, border-color 0.3s ease;
}
</style>
