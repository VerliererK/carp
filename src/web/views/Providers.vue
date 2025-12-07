<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listProviders, toggleProvider } from '@/api';
import type { Provider } from '@shared/types';
import ProviderCard from '@/components/ProviderCard.vue';

const providers = ref<(Provider & { keys_count: number })[]>([]);

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
  // TODO: Confirm and delete
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
</template>
