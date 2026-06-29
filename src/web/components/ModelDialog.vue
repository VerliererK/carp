<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useToast } from '@/composables/useToast';
import { Icon } from '@iconify/vue';
import type { Model, ModelMappingWithProvider, ProviderWithKeyCounts } from '@shared/types';
import { getModel, listProviders, listProviderModels, createModelMapping, updateModelMapping, deleteModelMapping, testModelMapping } from '@/api';
import BaseModal from './BaseModal.vue';

interface Props {
  modelValue: boolean;
  model?: Model | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', data: { name: string }): void;
  (e: 'mappings-changed'): void;
}>();

const toast = useToast();

const form = ref({ name: '' });
const error = ref<string | null>(null);

// Mappings state (edit mode only)
const mappings = ref<ModelMappingWithProvider[]>([]);
const providers = ref<ProviderWithKeyCounts[]>([]);
const loadingMappings = ref(false);

// Inline editing: null = not editing, 'new' = adding, number = editing mapping id
const editingId = ref<number | 'new' | null>(null);
const editForm = ref({ provider_id: 0, model_name: '' });
const savingMapping = ref(false);
const deletingMappingId = ref<number | null>(null);
const testingMappingId = ref<number | null>(null);
const testedMappingId = ref<number | null>(null);

// Provider model browsing
const providerModels = ref<string[]>([]);
const loadingProviderModels = ref(false);
const showModelPicker = ref(false);
const pickerProviderId = ref<number | null>(null);

const isEditMode = computed(() => !!props.model);
const title = computed(() => isEditMode.value ? 'Edit Model' : 'New Model');

const fetchMappingsAndProviders = async () => {
  if (!props.model) return;
  loadingMappings.value = true;
  try {
    const [detail, providerList] = await Promise.all([
      getModel(props.model.name),
      listProviders(),
    ]);
    mappings.value = detail.mappings;
    providers.value = providerList;
  } catch (e: any) {
    toast.error(e.message || 'Failed to load data');
  } finally {
    loadingMappings.value = false;
  }
};

watch([() => props.modelValue, () => props.model], ([open]) => {
  if (!open) {
    editingId.value = null;
    mappings.value = [];
    testingMappingId.value = null;
    testedMappingId.value = null;
    return;
  }
  if (props.model) {
    form.value = { name: props.model.name };
    fetchMappingsAndProviders();
  } else {
    form.value = { name: '' };
    mappings.value = [];
  }
  error.value = null;
}, { immediate: true });

const close = () => {
  if (props.loading || savingMapping.value) return;
  emit('update:modelValue', false);
  error.value = null;
};

const handleSave = () => {
  if (!form.value.name.trim()) {
    error.value = 'Name is required';
    return;
  }
  error.value = null;
  emit('save', { name: form.value.name.trim() });
};

// ===== Mapping CRUD =====

const startAdd = () => {
  editForm.value = {
    provider_id: providers.value[0]?.id ?? 0,
    model_name: '',
  };
  editingId.value = 'new';
};

const startEdit = (mapping: ModelMappingWithProvider) => {
  editForm.value = {
    provider_id: mapping.provider_id,
    model_name: mapping.model_name,
  };
  editingId.value = mapping.id;
};

const cancelEdit = () => {
  editingId.value = null;
  resetModelPicker();
};

const resetModelPicker = () => {
  showModelPicker.value = false;
  providerModels.value = [];
  pickerProviderId.value = null;
};

const toggleModelPicker = async () => {
  const provider = providers.value.find(p => p.id === editForm.value.provider_id);
  if (!provider) return;

  // If already loaded for this provider, just toggle visibility
  if (pickerProviderId.value === provider.id && providerModels.value.length > 0) {
    showModelPicker.value = !showModelPicker.value;
    return;
  }

  try {
    loadingProviderModels.value = true;
    showModelPicker.value = true;
    const models = await listProviderModels(provider.name);
    providerModels.value = Array.isArray(models) ? models : [];
    pickerProviderId.value = provider.id;
  } catch (e: any) {
    toast.error(e.message || 'Failed to fetch models');
    providerModels.value = [];
    showModelPicker.value = false;
  } finally {
    loadingProviderModels.value = false;
  }
};

const selectProviderModel = (name: string) => {
  editForm.value.model_name = name;
  showModelPicker.value = false;
};

watch(() => editForm.value.provider_id, () => {
  resetModelPicker();
});

const refreshMappings = async () => {
  if (!props.model) return;
  const detail = await getModel(props.model.name);
  mappings.value = detail.mappings;
  emit('mappings-changed');
};

const submitMapping = async () => {
  if (!props.model || !editForm.value.provider_id || !editForm.value.model_name.trim()) return;
  try {
    savingMapping.value = true;
    if (editingId.value === 'new') {
      await createModelMapping(props.model.name, {
        provider_id: editForm.value.provider_id,
        model_name: editForm.value.model_name.trim(),
      });
    } else if (typeof editingId.value === 'number') {
      await updateModelMapping(props.model.name, editingId.value, {
        provider_id: editForm.value.provider_id,
        model_name: editForm.value.model_name.trim(),
      });
    }
    toast.success('Mapping saved');
    editingId.value = null;
    await refreshMappings();
  } catch (e: any) {
    toast.error(e.message || 'Failed to save mapping');
  } finally {
    savingMapping.value = false;
  }
};

const handleDeleteMapping = async (mapping: ModelMappingWithProvider) => {
  if (!props.model) return;
  try {
    deletingMappingId.value = mapping.id;
    await deleteModelMapping(props.model.name, mapping.id);
    toast.success('Mapping deleted');
    await refreshMappings();
  } catch (e: any) {
    toast.error(e.message || 'Failed to delete mapping');
  } finally {
    deletingMappingId.value = null;
  }
};

const handleTestMapping = async (mapping: ModelMappingWithProvider) => {
  if (!props.model) return;
  try {
    testingMappingId.value = mapping.id;
    await testModelMapping(props.model.name, mapping.id);
    testedMappingId.value = mapping.id;
    setTimeout(() => {
      if (testedMappingId.value === mapping.id) testedMappingId.value = null;
    }, 2000);
    toast.success('Mapping test succeeded');
  } catch (e: any) {
    toast.error(e.message || 'Failed to test mapping');
  } finally {
    if (testingMappingId.value === mapping.id) testingMappingId.value = null;
  }
};
</script>

<template>
  <BaseModal :model-value="modelValue" :title="title" @close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-5">

      <!-- Error Message -->
      <div v-if="error"
        class="p-3 text-sm rounded-lg bg-status-error/10 text-status-error-text border border-status-error-border">
        {{ error }}
      </div>

      <!-- Name -->
      <div class="space-y-1.5">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Name</label>
        <input v-model="form.name" type="text"
          class="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors"
          placeholder="e.g. gpt-4o" @keydown.enter.prevent="handleSave" />
      </div>

      <!-- Mappings Section (edit mode only) -->
      <div v-if="isEditMode" class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wider">Mappings</label>
        </div>

        <!-- Loading -->
        <div v-if="loadingMappings" class="flex items-center justify-center py-4 text-text-tertiary">
          <Icon icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
        </div>

        <template v-else>
          <!-- Mapping list -->
          <div class="space-y-2">
            <template v-for="mapping in mappings" :key="mapping.id">
              <!-- Read-only row -->
              <div v-if="editingId !== mapping.id"
                class="flex items-center justify-between px-3 py-2.5 rounded-lg bg-app border border-border-subtle">
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <div class="w-2 h-2 rounded-full shrink-0"
                    :class="mapping.provider_enabled ? 'bg-status-success-text' : 'bg-border-subtle'"
                    :title="mapping.provider_enabled ? 'Provider enabled' : 'Provider disabled'"></div>
                  <span class="text-sm font-medium text-text-primary truncate">{{ mapping.provider_name }}</span>
                  <Icon icon="lucide:arrow-right" class="w-3 h-3 text-text-tertiary shrink-0" />
                  <span class="text-sm font-mono text-text-secondary truncate">{{ mapping.model_name }}</span>
                </div>

                <div class="flex items-center gap-0.5 shrink-0 ml-2">
                  <button type="button" @click="handleTestMapping(mapping)"
                    :disabled="!mapping.provider_enabled || editingId !== null || deletingMappingId !== null || (testingMappingId !== null && testingMappingId !== mapping.id)"
                    class="p-1.5 rounded-full text-text-tertiary cursor-pointer hover:text-brand-primary hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :title="testingMappingId === mapping.id ? 'Testing...' : (testedMappingId === mapping.id ? 'Test succeeded' : 'Test mapping')">
                    <Icon v-if="testingMappingId === mapping.id" icon="lucide:loader-2"
                      class="w-3.5 h-3.5 animate-spin" />
                    <Icon v-else :icon="testedMappingId === mapping.id ? 'lucide:check' : 'lucide:zap'"
                      class="w-3.5 h-3.5" :class="testedMappingId === mapping.id ? 'text-status-success-text' : ''" />
                  </button>
                  <button type="button" @click="startEdit(mapping)"
                    :disabled="editingId !== null || deletingMappingId !== null"
                    class="p-1.5 rounded-full text-text-tertiary cursor-pointer hover:text-brand-primary hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Edit mapping">
                    <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                  </button>
                  <button type="button" @click="handleDeleteMapping(mapping)"
                    :disabled="editingId !== null || deletingMappingId !== null"
                    class="p-1.5 rounded-full text-text-tertiary cursor-pointer hover:text-status-error-text hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Delete mapping">
                    <Icon :icon="deletingMappingId === mapping.id ? 'lucide:loader-2' : 'lucide:trash-2'"
                      class="w-3.5 h-3.5" :class="deletingMappingId === mapping.id ? 'animate-spin' : ''" />
                  </button>
                </div>
              </div>

              <!-- Inline edit form -->
              <form v-else @submit.prevent="submitMapping"
                class="space-y-3 p-3 rounded-lg border border-brand/50 bg-app">
                <div class="space-y-1.5">
                  <label class="block text-xs font-medium text-text-tertiary">Provider</label>
                  <select v-model="editForm.provider_id"
                    class="w-full px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus transition-colors appearance-none">
                    <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </div>
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <label class="block text-xs font-medium text-text-tertiary">Model Name</label>
                    <button type="button" @click="toggleModelPicker" :disabled="loadingProviderModels"
                      class="p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer transition-colors disabled:opacity-60"
                      title="Browse provider models">
                      <Icon :icon="loadingProviderModels ? 'lucide:loader-2' : 'lucide:list'" class="w-3.5 h-3.5"
                        :class="loadingProviderModels ? 'animate-spin' : ''" />
                    </button>
                  </div>
                  <input v-model="editForm.model_name" type="text" placeholder="e.g. gpt-4o"
                    class="w-full px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-border-focus transition-colors" />
                  <div v-if="showModelPicker && !loadingProviderModels"
                    class="max-h-36 overflow-y-auto rounded-lg border border-border-subtle bg-card">
                    <template v-if="providerModels.length">
                      <button v-for="m in providerModels" :key="m" type="button" @click="selectProviderModel(m)"
                        class="w-full text-left px-3 py-1.5 text-sm font-mono text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition-colors"
                        :class="editForm.model_name === m ? 'text-text-primary bg-card-hover' : ''">
                        {{ m }}
                      </button>
                    </template>
                    <div v-else class="px-3 py-2 text-xs text-text-tertiary text-center">No models found.</div>
                  </div>
                </div>
                <div class="flex justify-end gap-2">
                  <button type="button" @click="cancelEdit" :disabled="savingMapping"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-card-hover cursor-pointer transition-colors disabled:opacity-60">
                    Cancel
                  </button>
                  <button type="submit" :disabled="savingMapping"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand text-brand-on cursor-pointer hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                    {{ savingMapping ? 'Saving...' : 'Save' }}
                  </button>
                </div>
              </form>
            </template>

            <!-- Inline add form -->
            <form v-if="editingId === 'new'" @submit.prevent="submitMapping"
              class="space-y-3 p-3 rounded-lg border border-brand/50 bg-app">
              <div class="space-y-1.5">
                <label class="block text-xs font-medium text-text-tertiary">Provider</label>
                <select v-model="editForm.provider_id"
                  class="w-full px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus transition-colors appearance-none">
                  <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label class="block text-xs font-medium text-text-tertiary">Model Name</label>
                  <button type="button" @click="toggleModelPicker" :disabled="loadingProviderModels"
                    class="p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer transition-colors disabled:opacity-60"
                    title="Browse provider models">
                    <Icon :icon="loadingProviderModels ? 'lucide:loader-2' : 'lucide:list'" class="w-3.5 h-3.5"
                      :class="loadingProviderModels ? 'animate-spin' : ''" />
                  </button>
                </div>
                <input v-model="editForm.model_name" type="text" placeholder="e.g. gpt-4o"
                  class="w-full px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:border-border-focus transition-colors" />
                <div v-if="showModelPicker && !loadingProviderModels"
                  class="max-h-36 overflow-y-auto rounded-lg border border-border-subtle bg-card">
                  <template v-if="providerModels.length">
                    <button v-for="m in providerModels" :key="m" type="button" @click="selectProviderModel(m)"
                      class="w-full text-left px-3 py-1.5 text-sm font-mono text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition-colors"
                      :class="editForm.model_name === m ? 'text-text-primary bg-card-hover' : ''">
                      {{ m }}
                    </button>
                  </template>
                  <div v-else class="px-3 py-2 text-xs text-text-tertiary text-center">No models found.</div>
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <button type="button" @click="cancelEdit" :disabled="savingMapping"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-card-hover cursor-pointer transition-colors disabled:opacity-60">
                  Cancel
                </button>
                <button type="submit" :disabled="savingMapping"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand text-brand-on cursor-pointer hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {{ savingMapping ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </form>
          </div>

          <!-- Empty state -->
          <div v-if="mappings.length === 0 && editingId !== 'new'" class="text-center py-3 text-text-tertiary text-sm">
            No mappings yet.
          </div>

          <!-- Add mapping button -->
          <button v-if="editingId === null && deletingMappingId === null" type="button" @click="startAdd"
            class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-focus hover:bg-card-hover transition-colors cursor-pointer text-sm">
            <Icon icon="lucide:plus" class="w-4 h-4" />
            <span>Add Mapping</span>
          </button>
        </template>
      </div>
    </div>

    <template #footer>
      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium text-text-secondary bg-card hover:bg-card-hover border border-border-subtle cursor-pointer transition duration-200 ease-out"
        @click="close" :disabled="loading">
        Cancel
      </button>
      <button type="button"
        class="px-3 py-2 rounded-xl text-sm font-medium bg-brand text-brand-on border border-transparent cursor-pointer hover:bg-brand/90 disabled:opacity-60 disabled:cursor-not-allowed transition duration-200 ease-out"
        @click="handleSave" :disabled="loading">
        {{ loading ? 'Saving...' : 'Save Model' }}
      </button>
    </template>
  </BaseModal>
</template>
