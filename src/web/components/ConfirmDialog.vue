<script setup lang="ts">
import BaseModal from './BaseModal.vue';

interface Props {
  modelValue: boolean;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  isDanger?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  loading: false,
  isDanger: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const close = () => {
  if (props.loading) return;
  emit('update:modelValue', false);
  emit('cancel');
};

const handleConfirm = () => {
  if (props.loading) return;
  emit('confirm');
};
</script>

<template>
  <BaseModal :model-value="modelValue" :title="title" @close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <slot></slot>

    <template #footer>
      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium text-text-secondary bg-card hover:bg-card-hover border border-border-subtle cursor-pointer transition duration-150 ease-out disabled:opacity-60"
        @click="close" :disabled="loading">
        {{ cancelText }}
      </button>

      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium cursor-pointer border transition duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed"
        :class="[
          isDanger
            ? 'bg-status-error text-status-error-text border-status-error-border hover:bg-status-error/90'
            : 'bg-brand text-brand-on border-transparent hover:bg-brand/90'
        ]" @click="handleConfirm" :disabled="loading">
        {{ loading ? (isDanger ? 'Deleting...' : 'Loading...') : confirmText }}
      </button>
    </template>
  </BaseModal>
</template>
