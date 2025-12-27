<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@/composables/useToast';
import { Icon } from '@iconify/vue';
import { listProviders, createProvider, toggleProvider, updateProvider, deleteProvider } from '@/api';
import type { Provider } from '@shared/types';
import ProviderCard from '@/components/ProviderCard.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ProviderDialog from '@/components/ProviderDialog.vue';

const router = useRouter();
const toast = useToast();

const providers = ref<(Provider & { keys_count: number })[]>([]);

const showDeleteDialog = ref(false);
const providerToDelete = ref<Provider | null>(null);
const deleting = ref(false);

const showEditDialog = ref(false);
const editingProvider = ref<Provider | null>(null);
const savingProvider = ref(false);

const stats = computed(() => [
  {
    key: 'total',
    value: providers.value.length,
    icon: 'lucide:network',
    iconClass: 'text-brand',
  },
  {
    key: 'active',
    value: providers.value.filter((p) => p.enabled === 1).length,
    icon: 'lucide:shield-check',
    iconClass: 'text-status-success-text',
  },
  {
    key: 'keys',
    value: providers.value.reduce((acc, p) => acc + p.keys_count, 0),
    icon: 'lucide:key',
    iconClass: 'text-text-secondary',
  },
]);

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
    toast.error(e.message || 'Failed to toggle provider');
  }
};

const handleEdit = (id: number) => {
  const provider = providers.value.find((p) => p.id === id);
  if (!provider) return;
  editingProvider.value = provider;
  showEditDialog.value = true;
};

const handleCreate = () => {
  editingProvider.value = null;
  showEditDialog.value = true;
};

const handleSaveProvider = async (data: Partial<Omit<Provider, 'id'>>) => {
  try {
    savingProvider.value = true;
    if (editingProvider.value) {
      await updateProvider(editingProvider.value.name, data);
    } else {
      await createProvider(data as Omit<Provider, 'id'>);
    }
    toast.success('Provider saved successfully');
    showEditDialog.value = false;
    await getProviders();
  } catch (e: any) {
    toast.error(e.message || 'Failed to save provider');
  } finally {
    savingProvider.value = false;
  }
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
    toast.success('Provider deleted successfully');
    await getProviders();
    resetDeleteDialog();
  } catch (e: any) {
    toast.error(e.message || 'Failed to delete provider');
  } finally {
    deleting.value = false;
  }
};

const navigateToKeys = (name: string) => {
  router.push({ name: 'provider-keys', params: { name } });
};

onMounted(() => {
  getProviders();
});
</script>

<template>
  <div class="flex items-center justify-between mb-6">
    <!-- Stats Group -->
    <div
      class="w-auto flex items-center gap-4 py-2.5 px-4 bg-card border border-border-subtle rounded-2xl shadow-lg shadow-black/5">
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
      @click="handleCreate" title="New Provider">
      <Icon icon="lucide:plus" class="w-6 h-6" />
    </button>
  </div>

  <div class="space-y-4">
    <ProviderCard v-for="provider in providers" :key="provider.id" :provider="provider" class="cursor-pointer"
      @toggle="handleToggle" @edit="handleEdit" @delete="handleDelete" @click="navigateToKeys(provider.name)" />
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

  <ProviderDialog v-model="showEditDialog" :provider="editingProvider" :loading="savingProvider"
    @save="handleSaveProvider" />
</template>
