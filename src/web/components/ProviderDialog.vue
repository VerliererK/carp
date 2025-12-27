<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Provider } from '@shared/types';
import BaseModal from './BaseModal.vue';

interface Props {
  modelValue: boolean;
  provider?: Provider | null; // If provided, we are in edit mode
  loading?: boolean;
  lockName?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  lockName: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', data: Partial<Omit<Provider, 'id'>>): void;
}>();

const form = ref({
  name: '',
  type: 'openai',
  base_url: '',
  custom_headers: '',
  test_path: '',
  test_model: '',
  enabled: 1
});

// Keep track of initial state for dirty checking
const initialForm = ref<typeof form.value | null>(null);

const error = ref<string | null>(null);

const isEditMode = computed(() => !!props.provider);
const title = computed(() => isEditMode.value ? 'Edit Provider' : 'New Provider');

const initForm = (provider?: Provider | null) => {
  if (provider) {
    const data = {
      name: provider.name,
      type: provider.type,
      base_url: provider.base_url,
      custom_headers: provider.custom_headers || '',
      test_path: provider.test_path || '',
      test_model: provider.test_model || '',
      enabled: provider.enabled
    };
    form.value = { ...data };
    initialForm.value = { ...data };
    error.value = null;
    return;
  }

  const defaults = {
    name: '',
    type: 'openai',
    base_url: '',
    custom_headers: '',
    test_path: '',
    test_model: '',
    enabled: 1
  };
  form.value = { ...defaults };
  initialForm.value = null;
  error.value = null;
};

// Re-init each time dialog opens (so cancel doesn't keep dirty state),
// and also when provider changes while open.
watch([() => props.modelValue, () => props.provider], ([open]) => {
  if (!open) return;
  initForm(props.provider);
}, { immediate: true });

const close = () => {
  if (props.loading) return;
  emit('update:modelValue', false);
  error.value = null;
};

const validate = () => {
  if (!form.value.name.trim()) return 'Name is required';
  if (!form.value.base_url.trim()) return 'Base URL is required';

  if (form.value.custom_headers.trim()) {
    try {
      JSON.parse(form.value.custom_headers);
    } catch {
      return 'Custom Headers must be valid JSON';
    }
  }
  return null;
};

const handleSave = () => {
  error.value = validate();
  if (error.value) return;

  // Prepare data
  const currentData: Omit<Provider, 'id'> = {
    name: form.value.name.trim(),
    type: form.value.type.trim(),
    base_url: form.value.base_url.trim(),
    custom_headers: form.value.custom_headers.trim() || undefined,
    test_path: form.value.test_path?.trim() || undefined,
    test_model: form.value.test_model?.trim() || undefined,
    enabled: form.value.enabled
  };

  if (isEditMode.value && initialForm.value) {
    if (props.lockName) {
      currentData.name = initialForm.value.name;
    }

    // Diff: only send changed fields
    const updates: Partial<Omit<Provider, 'id'>> = {};
    let hasChanges = false;

    // Check basic fields
    if (!props.lockName && currentData.name !== initialForm.value.name) { updates.name = currentData.name; hasChanges = true; }
    if (currentData.type !== initialForm.value.type) { updates.type = currentData.type; hasChanges = true; }
    if (currentData.base_url !== initialForm.value.base_url) { updates.base_url = currentData.base_url; hasChanges = true; }
    if (currentData.enabled !== initialForm.value.enabled) { updates.enabled = currentData.enabled; hasChanges = true; }

    // Check optional fields (treat empty string as same as undefined/null for comparison)
    const initHeaders = initialForm.value.custom_headers || undefined;
    if (currentData.custom_headers !== initHeaders) { updates.custom_headers = currentData.custom_headers; hasChanges = true; }

    const initTestPath = initialForm.value.test_path || undefined;
    if (currentData.test_path !== initTestPath) { updates.test_path = currentData.test_path; hasChanges = true; }

    const initTestModel = initialForm.value.test_model || undefined;
    if (currentData.test_model !== initTestModel) { updates.test_model = currentData.test_model; hasChanges = true; }

    if (!hasChanges) {
      close(); // No changes, just close
      return;
    }

    emit('save', updates);
  } else {
    // Create mode: send all
    emit('save', currentData);
  }
};
</script>

<template>
  <BaseModal :model-value="modelValue" :title="title" @close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <form @submit.prevent="handleSave" class="space-y-4">

      <!-- Error Message -->
      <div v-if="error"
        class="p-3 text-sm rounded-lg bg-status-error/10 text-status-error-text border border-status-error-border">
        {{ error }}
      </div>

      <!-- Name & Type -->
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Name</label>
          <input v-model="form.name" type="text" :disabled="lockName && isEditMode"
            class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors"
            placeholder="e.g. openai" />
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Type</label>
          <select v-model="form.type"
            class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors appearance-none">
            <option value="openai">openai</option>
            <option value="google">google</option>
          </select>
        </div>
      </div>

      <!-- Base URL -->
      <div class="space-y-1.5">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Base URL</label>
        <input v-model="form.base_url" type="text"
          class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors font-mono text-sm"
          placeholder="https://api.openai.com/v1" />
      </div>

      <!-- Custom Headers -->
      <div class="space-y-1.5">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">
          Custom Headers <span class="text-text-tertiary normal-case font-normal">(JSON)</span>
        </label>
        <textarea v-model="form.custom_headers" rows="3"
          class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors font-mono text-xs"
          placeholder='{}'></textarea>
      </div>

      <!-- Test Config (Test Path & Test Model) -->
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Test Path</label>
          <input v-model="form.test_path" type="text"
            class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors text-sm"
            placeholder="/v1/chat/completions" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Test Model</label>
          <input v-model="form.test_model" type="text"
            class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors text-sm"
            placeholder="gpt-5" />
        </div>
      </div>

    </form>

    <template #footer>
      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium text-text-secondary bg-card hover:bg-card-hover border border-border-subtle cursor-pointer transition duration-150 ease-out"
        @click="close" :disabled="loading">
        Cancel
      </button>
      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium bg-brand text-brand-on border border-transparent cursor-pointer hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition duration-150 ease-out"
        @click="handleSave" :disabled="loading">
        {{ loading ? 'Saving...' : 'Save Provider' }}
      </button>
    </template>
  </BaseModal>
</template>
