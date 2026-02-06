<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useToast } from '@/composables/useToast';
import { Icon } from '@iconify/vue';
import type { Provider } from '@shared/types';
import { listProviderModels } from '@/api';
import BaseModal from './BaseModal.vue';

interface Props {
  modelValue: boolean;
  provider?: Provider | null; // If provided, we are in edit mode
  loading?: boolean;
  lockName?: boolean;
}

const toast = useToast();

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

// Models fetching state
const showModels = ref(false);
const loadingModels = ref(false);
const modelsList = ref<string[]>([]);
const modelsError = ref<string | null>(null);

// Keep track of initial state for dirty checking
const initialForm = ref<typeof form.value | null>(null);

const error = ref<string | null>(null);

const isEditMode = computed(() => !!props.provider);
const isGemini = computed(() => form.value.type === 'gemini');
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
  if (!open) {
    showModels.value = false;
    modelsList.value = [];
    return;
  }
  initForm(props.provider);
}, { immediate: true });

watch(() => form.value.type, (type) => {
  if (type === 'gemini') form.value.test_path = '';
});

const close = () => {
  if (props.loading) return;
  emit('update:modelValue', false);
  error.value = null;
  showModels.value = false;
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

const normalizeNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const handleSave = () => {
  error.value = validate();
  if (error.value) return;

  // Prepare data
  const currentData: Omit<Provider, 'id'> = {
    name: form.value.name.trim(),
    type: form.value.type.trim(),
    base_url: form.value.base_url.trim(),
    custom_headers: normalizeNullableText(form.value.custom_headers),
    test_path: normalizeNullableText(form.value.test_path),
    test_model: normalizeNullableText(form.value.test_model),
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
    const initHeaders = normalizeNullableText(initialForm.value.custom_headers);
    if (currentData.custom_headers !== initHeaders) { updates.custom_headers = currentData.custom_headers; hasChanges = true; }

    const initTestPath = normalizeNullableText(initialForm.value.test_path);
    if (currentData.test_path !== initTestPath) { updates.test_path = currentData.test_path; hasChanges = true; }

    const initTestModel = normalizeNullableText(initialForm.value.test_model);
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

const fetchModels = async () => {
  if (!isEditMode.value || !form.value.name) return;

  showModels.value = true;
  loadingModels.value = true;
  modelsError.value = null;
  modelsList.value = [];

  try {
    const data = await listProviderModels(form.value.name, form.value.type);
    if (Array.isArray(data)) {
      modelsList.value = data;
      if (data.length === 0) {
        modelsError.value = 'No models found';
      }
    } else {
      // Fallback for non-standard responses
      modelsError.value = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }
  } catch (e: any) {
    modelsError.value = e.message || 'Failed to fetch models';
  } finally {
    loadingModels.value = false;
  }
};

const selectModel = (model: string) => {
  form.value.test_model = model;
  showModels.value = false;
};

const copiedModel = ref<number | null>(null);
const copyModel = async (model: string, index: number) => {
  try {
    await navigator.clipboard.writeText(model);
    copiedModel.value = index;
    setTimeout(() => {
      if (copiedModel.value === index) copiedModel.value = null;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    toast.error('Failed to copy to clipboard');
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
            <option value="gemini">gemini</option>
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
          <input v-model="form.test_path" type="text" :disabled="isGemini"
            class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors text-sm"
            :placeholder="isGemini ? '/v1beta/models/{model}:generateContent' : '/v1/chat/completions'" />
        </div>

        <div class="relative space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Test Model</label>
            <button v-if="isEditMode" type="button" @click="fetchModels"
              class="text-xs text-brand hover:text-brand/70 flex items-center gap-1 transition-colors cursor-pointer"
              title="List Models">
              <Icon icon="lucide:list" class="w-3 h-3" />
              <span>List</span>
            </button>
          </div>

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

  <!-- Model Selection Modal -->
  <BaseModal v-model="showModels" title="Select Model" @close="showModels = false">
    <div class="min-h-[100px] max-h-[50vh] overflow-y-auto -mr-2 pr-2">
      <!-- Loading -->
      <div v-if="loadingModels" class="flex flex-col items-center justify-center py-8 text-text-tertiary space-y-3">
        <Icon icon="lucide:loader-2" class="w-8 h-8 animate-spin" />
        <span class="text-sm">Fetching models...</span>
      </div>

      <!-- Error -->
      <div v-else-if="modelsError"
        class="p-4 rounded-lg bg-status-error/10 border border-status-error-border text-status-error-text text-sm">
        <div class="font-semibold mb-1">Failed to load models</div>
        <div class="font-mono text-xs whitespace-pre-wrap break-all">{{ modelsError }}</div>
      </div>

      <!-- List -->
      <div v-else-if="modelsList.length > 0" class="grid gap-2 my-2">
        <div v-for="(model, index) in modelsList" :key="index" @click="selectModel(model)"
          class="w-full min-w-0 flex items-center gap-2 px-4 py-3 rounded-xl bg-app border border-border-subtle hover:border-brand/50 hover:bg-card-hover hover:shadow-sm transition-all group cursor-pointer">
          <div
            class="flex-1 min-w-0 text-sm font-medium text-text-primary group-hover:text-brand transition-colors truncate">
            {{ model }}
          </div>
          <button type="button" @click.stop="copyModel(model, index)"
            class="shrink-0 -m-3 p-3 text-text-tertiary hover:text-text-primary cursor-pointer" title="Copy model name">
            <Icon :icon="copiedModel === index ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4 shrink-0"
              :class="copiedModel === index ? 'text-status-success-text' : ''" />
          </button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="text-center py-8 text-text-tertiary text-sm">
        No models found.
      </div>
    </div>

    <template #footer>
      <button type="button"
        class="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary bg-card hover:bg-card-hover border border-border-subtle cursor-pointer transition-colors"
        @click="showModels = false">
        Close
      </button>
    </template>
  </BaseModal>
</template>
