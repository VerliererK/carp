<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useToast } from '@/composables/useToast';
import { Icon } from '@iconify/vue';
import { listModels, createModel, updateModel, deleteModel } from '@/api';
import type { Model } from '@shared/types';
import ModelCard from '@/components/ModelCard.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ModelDialog from '@/components/ModelDialog.vue';

const toast = useToast();

const models = ref<(Model & { mappings_count: number })[]>([]);

// Model dialog
const showModelDialog = ref(false);
const editingModel = ref<Model | null>(null);
const savingModel = ref(false);

// Model delete
const showDeleteModelDialog = ref(false);
const modelToDelete = ref<Model & { mappings_count: number } | null>(null);
const deletingModel = ref(false);

const stats = computed(() => [
  {
    key: 'total',
    value: models.value.length,
    icon: 'lucide:box',
    iconClass: 'text-brand',
  },
  {
    key: 'active',
    value: models.value.filter((m) => m.enabled === 1).length,
    icon: 'lucide:shield-check',
    iconClass: 'text-status-success-text',
  },
  {
    key: 'mappings',
    value: models.value.reduce((acc, m) => acc + m.mappings_count, 0),
    icon: 'lucide:route',
    iconClass: 'text-text-secondary',
  },
]);

// ========== Data Loading ==========

const fetchModels = async () => {
  models.value = await listModels();
};

// ========== Model CRUD ==========

const handleCreateModel = () => {
  editingModel.value = null;
  showModelDialog.value = true;
};

const handleEditModel = (name: string) => {
  const model = models.value.find((m) => m.name === name);
  if (!model) return;
  editingModel.value = model;
  showModelDialog.value = true;
};

const handleSaveModel = async (data: { name: string }) => {
  try {
    savingModel.value = true;
    if (editingModel.value) {
      const oldName = editingModel.value.name;
      if (data.name !== oldName) {
        await updateModel(oldName, { name: data.name });
      }
    } else {
      await createModel(data);
    }
    toast.success('Model saved successfully');
    showModelDialog.value = false;
    await fetchModels();
  } catch (e: any) {
    toast.error(e.message || 'Failed to save model');
  } finally {
    savingModel.value = false;
  }
};

const handleToggleModel = async (name: string) => {
  const model = models.value.find((m) => m.name === name);
  if (!model) return;
  const nextEnabled = model.enabled === 0;
  try {
    await updateModel(name, { enabled: nextEnabled });
    model.enabled = nextEnabled ? 1 : 0;
  } catch (e: any) {
    toast.error(e.message || 'Failed to toggle model');
  }
};

const handleDeleteModel = (name: string) => {
  const model = models.value.find((m) => m.name === name);
  if (!model) return;
  modelToDelete.value = model;
  showDeleteModelDialog.value = true;
};

const resetDeleteModelDialog = () => {
  showDeleteModelDialog.value = false;
  modelToDelete.value = null;
};

const confirmDeleteModel = async () => {
  if (!modelToDelete.value) return;
  try {
    deletingModel.value = true;
    await deleteModel(modelToDelete.value.name);
    toast.success('Model deleted successfully');
    await fetchModels();
    resetDeleteModelDialog();
  } catch (e: any) {
    toast.error(e.message || 'Failed to delete model');
  } finally {
    deletingModel.value = false;
  }
};

onMounted(() => {
  fetchModels();
});
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <!-- Stats Group -->
    <div
      class="w-auto flex items-center gap-4 py-2.5 px-4 bg-card border border-border-subtle rounded-2xl shadow-float">
      <template v-for="(stat, idx) in stats" :key="stat.key">
        <div class="flex flex-row items-center gap-1">
          <div class="flex items-center justify-center px-2" :class="stat.iconClass">
            <Icon :icon="stat.icon" class="w-5 h-5" />
          </div>
          <span class="text-lg font-bold font-mono leading-none">{{ stat.value }}</span>
        </div>
        <div v-if="idx < stats.length - 1" class="hidden md:block w-px h-8 bg-border-subtle/50"></div>
      </template>
    </div>

    <button type="button"
      class="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors cursor-pointer"
      @click="handleCreateModel" title="New Model">
      <Icon icon="lucide:plus" class="w-6 h-6" />
    </button>
  </div>

  <div v-if="models.length"
    class="space-y-3 md:space-y-0 md:bg-card md:border md:border-border-subtle md:rounded-2xl md:shadow-float md:overflow-hidden md:divide-y md:divide-border-subtle">
    <ModelCard v-for="model in models" :key="model.name" :model="model" @click="handleEditModel(model.name)"
      @toggle="handleToggleModel" @edit="handleEditModel" @delete="handleDeleteModel" />
  </div>

  <!-- Delete Model Dialog -->
  <ConfirmDialog v-model="showDeleteModelDialog"
    :title="modelToDelete ? `Delete ${modelToDelete.name}?` : 'Delete model'" confirm-text="Delete" is-danger
    :loading="deletingModel" @confirm="confirmDeleteModel" @cancel="resetDeleteModelDialog">
    <p class="text-sm text-text-secondary">
      Are you sure you want to delete
      <span v-if="modelToDelete" class="font-semibold text-text-primary">
        {{ modelToDelete.name }}
      </span>
      ?
      This will also remove all its mappings. This action cannot be undone.
    </p>
  </ConfirmDialog>

  <!-- Model Dialog -->
  <ModelDialog v-model="showModelDialog" :model="editingModel" :loading="savingModel" @save="handleSaveModel"
    @mappings-changed="fetchModels" />
</template>
