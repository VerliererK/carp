<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listProviders, toggleProvider, deleteProvider } from '@/api';
import type { Provider } from '@shared/types';
import ProviderCard from '@/components/ProviderCard.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const providers = ref<(Provider & { keys_count: number })[]>([]);

const showDeleteDialog = ref(false);
const providerToDelete = ref<Provider | null>(null);
const deleting = ref(false);

const getProviders = async () => {
  providers.value = await listProviders();
};

const handleToggle = async (id: number) => {
  const provider = providers.value.find((p) => p.id === id);
  if (!provider) return;
  const nextEnabled = provider.enabled === 0 ? 1 : 0;
  try {
    await toggleProvider(provider.name, nextEnabled === 1);
    provider.enabled = nextEnabled;
  } catch (e: any) {
    alert(e.message || 'Failed to toggle provider');
  }
};

const handleEdit = (id: number) => {
  // TODO: Open edit modal
};

const handleDelete = (id: number) => {
  const provider = providers.value.find((p) => p.id === id);
  if (!provider) return;
  providerToDelete.value = provider;
  showDeleteDialog.value = !!provider;
};

const resetDeleteDialog = () => {
  showDeleteDialog.value = false;
  providerToDelete.value = null;
};

const confirmDelete = async () => {
  if (!providerToDelete.value) return;

  try {
    deleting.value = true;
    await deleteProvider(providerToDelete.value.name);
    await getProviders();
    resetDeleteDialog();
  } catch (e: any) {
    alert(e.message || 'Failed to delete provider');
  } finally {
    deleting.value = false;
  }
};

onMounted(() => {
  getProviders();
});
</script>

<template>
  <div class="space-y-4">
    <ProviderCard v-for="provider in providers" :key="provider.id" :provider="provider" @toggle="handleToggle"
      @edit="handleEdit" @delete="handleDelete" />
  </div>

  <ConfirmDialog v-model="showDeleteDialog"
    :title="providerToDelete ? `Delete ${providerToDelete.name}?` : 'Delete provider'" confirm-text="Delete" is-danger
    :loading="deleting" @confirm="confirmDelete" @cancel="resetDeleteDialog">
    <p class="text-sm text-text-secondary">
      Are you sure you want to delete
      <span v-if="providerToDelete" class="font-semibold text-text-primary">
        {{ providerToDelete.name }}
      </span>
      ?
      This action cannot be undone.
    </p>
  </ConfirmDialog>
</template>
