<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { listKeys, createKeys, resetProviderKeys, resetKey, deleteKey, testKey, getProvider, updateProvider } from '@/api';
import type { ApiKey, Provider } from '@shared/types';
import PaginationBar from '@/components/PaginationBar.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ProviderDialog from '@/components/ProviderDialog.vue';

const route = useRoute();
const router = useRouter();

const keys = ref<ApiKey[]>([]);
const summary = ref<{ total: number; active: number; invalid: number; total_requests: number; total_failures: number }>({
  total: 0,
  active: 0,
  invalid: 0,
  total_requests: 0,
  total_failures: 0
});
const total = ref(0);
const loading = ref(true);
const actionLoading = ref(false);
const showEditProviderDialog = ref(false);
const editingProvider = ref<Provider | null>(null);
const savingProvider = ref(false);

// Header
const providerName = computed(() => route.params.name as string);
const proxyUrl = computed(() => `${window.location.origin}/proxy/${providerName.value}`);
const copied = ref(false);
const copyUrl = async () => {
  if (!proxyUrl.value) return;
  try {
    await navigator.clipboard.writeText(proxyUrl.value);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const copiedKeyId = ref<number | null>(null);
const copyKey = async (key: ApiKey) => {
  if (!key?.key) return;
  try {
    await navigator.clipboard.writeText(key.key);
    copiedKeyId.value = key.id;
    setTimeout(() => {
      if (copiedKeyId.value === key.id) copiedKeyId.value = null;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

// Toolbar
const searchQuery = ref('');
const appliedSearchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'invalid'>('all');
const hasSearchText = computed(() => searchQuery.value.trim() !== '');
const isSearchDirty = computed(() => searchQuery.value.trim() !== appliedSearchQuery.value);
const showToolbarReset = computed(() => hasSearchText.value || appliedSearchQuery.value !== '' || statusFilter.value !== 'all');
const resetToolbar = () => {
  const statusChanged = statusFilter.value !== 'all';
  const appliedChanged = appliedSearchQuery.value !== '';
  searchQuery.value = '';
  appliedSearchQuery.value = '';
  statusFilter.value = 'all';
  page.value = 1;
  if (!statusChanged && appliedChanged) fetchKeys();
};

// Pagination
const page = ref(1);
const limit = ref(20);
const limitOptions = [10, 20, 50, 100] as const;
const offset = computed(() => (page.value - 1) * limit.value);

// Stats
const stats = computed(() => [
  {
    key: 'total',
    label: 'Total',
    value: summary.value?.total ?? 0,
    icon: 'lucide:key',
    iconClass: 'text-brand',
  },
  {
    key: 'active',
    label: 'Active',
    value: summary.value?.active ?? 0,
    icon: 'lucide:shield-check',
    iconClass: 'text-status-success-text',
    valueClass: 'text-status-success-text',
  },
  {
    key: 'requests',
    label: 'Requests',
    value: summary.value?.total_requests ?? 0,
    icon: 'lucide:activity',
    iconClass: 'text-text-secondary',
  },
]);

// Keys List
type SortField = 'total_count' | 'failure_count' | 'last_used';
const sortField = ref<SortField>('last_used');
const sortOrder = ref<'asc' | 'desc'>('desc');

const sortableColumns: ReadonlyArray<{ field: SortField; label: string; }> = [
  { field: 'total_count', label: 'Requests' },
  { field: 'failure_count', label: 'Failures' },
  { field: 'last_used', label: 'Last Used' },
];

const getSortIcon = (field: SortField) => {
  if (sortField.value !== field) return '';
  return sortOrder.value === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down';
};

const getSortIconClass = (field: SortField) => {
  if (sortField.value === field) return 'text-text-primary';
  return 'text-text-tertiary opacity-0 group-hover:opacity-100';
};

const toggleSort = (field: SortField) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortField.value = field;
  sortOrder.value = 'desc';
};

const maskKey = (key: string) => {
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

const formatTime = (time?: string): string => {
  if (!time) return '';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const filteredAndSortedKeys = computed(() => keys.value);

const applySearch = () => {
  appliedSearchQuery.value = searchQuery.value.trim();
  page.value = 1;
  fetchKeys();
};

const clearSearch = () => {
  const wasApplied = appliedSearchQuery.value !== '';
  searchQuery.value = '';
  appliedSearchQuery.value = '';
  if (wasApplied) {
    page.value = 1;
    fetchKeys();
  }
};

const fetchKeys = async () => {
  const name = providerName.value;
  if (!name) return;

  const q = appliedSearchQuery.value;
  const status = statusFilter.value;
  const sort = sortField.value;
  const order = sortOrder.value;

  try {
    loading.value = true;
    const res = await listKeys(name, {
      limit: limit.value,
      offset: offset.value,
      q: q || undefined,
      status,
      sort,
      order,
    });

    keys.value = res.keys;
    total.value = res.total;
    if (res.summary) summary.value = res.summary;
  } catch (e: any) {
    alert(e.message || 'Failed to load keys');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchKeys();
});

watch(statusFilter, () => {
  page.value = 1;
  fetchKeys();
});

watch([sortField, sortOrder], () => {
  fetchKeys();
});

const onPageChange = (next: number) => {
  page.value = next;
  fetchKeys();
};

const onLimitChange = (next: number) => {
  limit.value = next;
  page.value = 1;
  fetchKeys();
};

const openEditProviderDialog = async () => {
  const name = providerName.value;
  if (!name) return;

  try {
    savingProvider.value = true;
    editingProvider.value = await getProvider(name);
    showEditProviderDialog.value = true;
  } catch (e: any) {
    alert(e.message || 'Failed to load provider');
  } finally {
    savingProvider.value = false;
  }
};

const handleSaveProvider = async (data: Partial<Omit<Provider, 'id'>>) => {
  if (!editingProvider.value) return;

  try {
    savingProvider.value = true;
    const { name: _ignoredName, ...updates } = data;
    await updateProvider(editingProvider.value.name, updates);
    showEditProviderDialog.value = false;
  } catch (e: any) {
    alert(e.message || 'Failed to save provider');
  } finally {
    savingProvider.value = false;
  }
};

const testingKeyId = ref<number | null>(null);
const testedKeyId = ref<number | null>(null);
const handleTestKey = async (key: ApiKey) => {
  const name = providerName.value;
  if (!name) return;
  try {
    testingKeyId.value = key.id;
    await testKey(name, key.id);
    testedKeyId.value = key.id;
    setTimeout(() => {
      if (testedKeyId.value === key.id) testedKeyId.value = null;
    }, 2000);
    alert('Key test succeeded');
  } catch (e: any) {
    alert(e.message || 'Failed to test key');
  } finally {
    if (testingKeyId.value === key.id) testingKeyId.value = null;
  }
};

// Dialogs
const addKeysDialogOpen = ref(false);
const resetAllDialogOpen = ref(false);
const resetKeyDialogOpen = ref(false);
const deleteKeyDialogOpen = ref(false);
const selectedKey = ref<ApiKey | null>(null);
const addKeysText = ref('');

const parsedAddKeys = computed(() => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of addKeysText.value.split(/\r?\n/)) {
    const key = rawLine.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
});

const openAddKeysDialog = () => {
  addKeysDialogOpen.value = true;
};

const clearAddKeys = () => {
  addKeysText.value = '';
};

const handleCreateKeys = async () => {
  if (!providerName.value) return;
  const keysToCreate = parsedAddKeys.value;
  if (keysToCreate.length === 0) {
    alert('Please paste at least one key (one per line).');
    return;
  }
  try {
    actionLoading.value = true;
    const res = await createKeys(providerName.value, keysToCreate);
    addKeysDialogOpen.value = false;
    clearAddKeys();
    alert(res.message || `Created ${res.keys.length} keys`);
    await fetchKeys();
  } catch (e: any) {
    alert(e.message || 'Failed to create keys');
  } finally {
    actionLoading.value = false;
  }
};

const openResetAllDialog = () => {
  resetAllDialogOpen.value = true;
};

const openResetKeyDialog = (key: ApiKey) => {
  selectedKey.value = key;
  resetKeyDialogOpen.value = true;
};

const openDeleteKeyDialog = (key: ApiKey) => {
  selectedKey.value = key;
  deleteKeyDialogOpen.value = true;
};

const clearSelectedKey = () => {
  selectedKey.value = null;
};

const handleResetProviderKeys = async () => {
  if (!providerName.value) return;
  try {
    actionLoading.value = true;
    await resetProviderKeys(providerName.value);
    resetAllDialogOpen.value = false;
    await fetchKeys();
  } catch (e: any) {
    alert(e.message || 'Failed to reset provider keys');
  } finally {
    actionLoading.value = false;
  }
};

const handleResetKey = async () => {
  if (!providerName.value || !selectedKey.value) return;
  try {
    actionLoading.value = true;
    await resetKey(providerName.value, selectedKey.value.id);
    resetKeyDialogOpen.value = false;
    clearSelectedKey();
    await fetchKeys();
  } catch (e: any) {
    alert(e.message || 'Failed to reset key');
  } finally {
    actionLoading.value = false;
  }
};

const handleDeleteKey = async () => {
  if (!providerName.value || !selectedKey.value) return;
  try {
    actionLoading.value = true;
    await deleteKey(providerName.value, selectedKey.value.id);
    deleteKeyDialogOpen.value = false;
    clearSelectedKey();
    if (keys.value.length <= 1 && page.value > 1) page.value -= 1;
    await fetchKeys();
  } catch (e: any) {
    alert(e.message || 'Failed to delete key');
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-4">

    <!-- Header Section -->
    <div class="flex items-start gap-4">

      <div class="flex items-start gap-4 min-w-0">
        <button type="button" @click="router.push({ name: 'providers' })" class="icon-btn -ml-2 shrink-0"
          title="Back to Providers">
          <Icon icon="lucide:arrow-left" class="w-6 h-6" />
        </button>

        <div class="flex flex-col min-w-0">
          <h1 class="text-3xl font-bold"> {{ providerName }} </h1>

          <button @click="copyUrl"
            class="flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary mt-1 min-w-0">
            <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="w-3.5 h-3.5 shrink-0"
              :class="copied ? 'text-status-success-text' : ''" />
            <span class="truncate"> {{ proxyUrl }} </span>
          </button>
        </div>
      </div>

      <button class="icon-btn ml-auto disabled:opacity-60 disabled:cursor-not-allowed" type="button"
        :disabled="savingProvider" @click="openEditProviderDialog" title="Edit Provider">
        <Icon icon="lucide:settings" class="w-6 h-6" />
      </button>
    </div>

    <!-- Stats & Actions Section -->
    <div class="flex flex-wrap justify-between gap-4">
      <!-- Stats Group -->
      <div
        class="w-full md:w-auto grid grid-cols-3 md:flex items-center gap-4 py-2.5 px-4 bg-card border border-border-subtle rounded-2xl">
        <template v-for="(stat, idx) in stats" :key="stat.key">
          <div class="flex flex-col md:flex-row items-center gap-1" :title="`${stat.label} Keys`">
            <div class="flex items-center justify-center px-2" :class="stat.iconClass">
              <Icon :icon="stat.icon" class="w-5 h-5" />
            </div>
            <div class="flex flex-col items-center gap-1">
              <span class="uppercase tracking-wider text-text-secondary font-bold">{{ stat.label }}</span>
              <span class="text-lg font-bold font-mono leading-none" :class="stat.valueClass">{{ stat.value }}</span>
            </div>
          </div>
          <div v-if="idx < stats.length - 1" class="hidden md:block w-px h-8 bg-border-subtle/50"></div>
        </template>
      </div>

      <!-- Action Group -->
      <div class="w-full md:w-auto grid grid-cols-2 items-center gap-4">
        <button class="action-icon action-secondary" type="button" @click="openResetAllDialog"
          :disabled="loading || actionLoading">
          <Icon icon="lucide:refresh-cw" class="w-4 h-4" />
          <span>Reset Stats</span>
        </button>
        <button class="action-icon action-primary" type="button" @click="openAddKeysDialog"
          :disabled="loading || actionLoading">
          <Icon icon="lucide:plus" class="w-5 h-5" />
          <span>Add Keys</span>
        </button>
      </div>
    </div>

    <!-- Keys List Section -->
    <div class="space-y-4 mt-8">
      <!-- Filter -->
      <div class="flex w-auto items-center gap-3">
        <!-- Search -->
        <div class="relative w-64 group">
          <Icon icon="lucide:search"
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary group-focus-within:text-brand transition-colors" />
          <input v-model="searchQuery" type="text" placeholder="Search keys..." @keydown.enter.prevent="applySearch"
            class="w-full pl-9 pr-16 py-2 bg-card border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-brand/10" />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button v-if="hasSearchText" type="button"
              class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-card-hover transition-colors"
              title="Clear" @click="clearSearch">
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
            <button type="button"
              class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Search" :disabled="loading || !isSearchDirty" @click="applySearch">
              <Icon icon="lucide:arrow-right" class="w-4 h-4" />
            </button>
          </div>
        </div>
        <!-- Status -->
        <div class="relative">
          <select v-model="statusFilter"
            class="px-3 pr-9 py-2 bg-card border border-border-subtle rounded-xl focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-brand/10 appearance-none">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="invalid">Invalid</option>
          </select>
          <Icon icon="lucide:chevron-down" class="filters-icon right-3" />
        </div>

        <button v-if="showToolbarReset" type="button" @click="resetToolbar"
          class="text-text-secondary hover:text-text-primary cursor-pointer" title="Reset">
          <Icon icon="lucide:rotate-ccw" class="w-4 h-4" />
        </button>
      </div>

      <!-- Desktop Table -->
      <div class="log-card overflow-hidden hidden md:block">
        <table class="w-full text-left">
          <thead class="border-b border-border-subtle">
            <tr>
              <th class="px-4 py-3 font-medium text-text-secondary w-16">Status</th>
              <th class="px-4 py-3 font-medium text-text-secondary">Key</th>
              <th v-for="col in sortableColumns" :key="col.field"
                class="px-4 py-3 font-medium text-text-secondary whitespace-nowrap w-20">
                <button type="button"
                  class="group inline-flex items-center gap-1 hover:text-text-primary cursor-pointer"
                  @click="toggleSort(col.field)">
                  <span>{{ col.label }}</span>
                  <Icon :icon="getSortIcon(col.field)" class="w-3.5 h-3.5" :class="getSortIconClass(col.field)" />
                </button>
              </th>
              <th class="px-4 py-3 font-medium text-text-secondary w-32">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle">
            <template v-if="loading">
              <tr>
                <td colspan="6" class="px-4 py-10 text-center text-text-secondary">
                  <div class="inline-flex items-center gap-2">
                    <Icon icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
                    <span>Loading keys...</span>
                  </div>
                </td>
              </tr>
            </template>

            <template v-else-if="filteredAndSortedKeys.length">
              <tr v-for="k in filteredAndSortedKeys" :key="k.id" class="hover:bg-card-hover/50">
                <td class="px-4 py-3">
                  <Icon icon="lucide:circle-check-big" class="w-4 h-4 text-status-success-text"
                    v-if="k.status === 'active'" />
                  <Icon icon="lucide:circle-x" class="w-4 h-4 text-status-error-text" v-else />
                </td>

                <td class="px-4 py-3">
                  <div class="group inline-flex items-center gap-2">
                    <span class="font-mono text-text-primary">{{ maskKey(k.key) }}</span>
                    <button type="button" @click="copyKey(k)" :disabled="actionLoading"
                      class="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-card-hover disabled:opacity-60 disabled:cursor-not-allowed"
                      :title="copiedKeyId === k.id ? 'Copied' : 'Copy key'">
                      <Icon :icon="copiedKeyId === k.id ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4"
                        :class="copiedKeyId === k.id ? 'text-status-success-text' : ''" />
                    </button>
                  </div>
                </td>

                <td class="px-4 py-3 font-mono text-text-secondary">{{ k.total_count }}</td>

                <td class="px-4 py-3 font-mono text-sm"
                  :class="k.failure_count > 0 ? 'text-status-error-text' : 'text-text-secondary'">
                  {{ k.failure_count }}
                </td>

                <td class="px-4 py-3 text-text-secondary leading-tight">{{ formatTime(k.last_used) }}</td>

                <td class="px-4 py-3 whitespace-nowrap">
                  <button type="button" class="row-action-btn disabled:opacity-60 disabled:cursor-not-allowed"
                    @click="handleTestKey(k)" :disabled="actionLoading || !!testingKeyId"
                    :title="testingKeyId === k.id ? 'Testing...' : (testedKeyId === k.id ? 'Test succeeded' : 'Test key')">
                    <Icon v-if="testingKeyId === k.id" icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
                    <Icon v-else :icon="testedKeyId === k.id ? 'lucide:check' : 'lucide:zap'" class="w-4 h-4"
                      :class="testedKeyId === k.id ? 'text-status-success-text' : ''" />
                  </button>
                  <button type="button" class="row-action-btn" @click="openResetKeyDialog(k)" :disabled="actionLoading">
                    <Icon icon="lucide:refresh-cw" class="w-4 h-4" />
                  </button>
                  <button type="button" class="row-action-btn row-action-btn-danger" @click="openDeleteKeyDialog(k)"
                    :disabled="actionLoading">
                    <Icon icon="lucide:trash-2" class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </template>

            <template v-else>
              <tr>
                <td colspan="6" class="px-4 py-12 text-center">
                  <div class="flex flex-col items-center gap-2">
                    <Icon icon="lucide:key-round" class="w-8 h-8 opacity-20" />
                    <p>No keys found.</p>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Mobile List -->
      <div class="log-card md:hidden divide-y divide-border-subtle">
        <template v-if="loading">
          <div class="py-12 flex justify-center items-center gap-2">
            <Icon icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
            <span>Loading keys...</span>
          </div>
        </template>

        <template v-else-if="filteredAndSortedKeys.length">
          <div v-for="k in filteredAndSortedKeys" :key="k.id" class="w-full p-4">
            <div class="flex gap-4">
              <div class="flex items-center gap-2 min-w-0">
                <Icon v-if="k.status === 'active'" icon="lucide:circle-check-big"
                  class="w-4 h-4 text-status-success-text shrink-0" />
                <Icon v-else icon="lucide:circle-x" class="w-4 h-4 text-status-error-text shrink-0" />
                <span class="font-mono text-text-primary text-sm truncate">{{ maskKey(k.key) }}</span>
              </div>
              <button type="button" @click="copyKey(k)" class="rounded-lg text-text-tertiary hover:text-text-primary"
                :title="copiedKeyId === k.id ? 'Copied' : 'Copy key'">
                <Icon :icon="copiedKeyId === k.id ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4"
                  :class="copiedKeyId === k.id ? 'text-status-success-text' : ''" />
              </button>
            </div>


            <!-- Stats & Actions Row -->
            <div class="flex items-center justify-between">
              <!-- Stats -->
              <div class="flex gap-4">
                <div class="flex items-center gap-2" title="Requests">
                  <Icon icon="lucide:activity" class="w-4 h-4 text-text-tertiary" />
                  <span class="font-mono text-sm text-text-secondary">{{ k.total_count }}</span>
                </div>
                <div class="flex items-center gap-2" title="Failures">
                  <Icon icon="lucide:alert-circle" class="w-4 h-4 text-text-tertiary" />
                  <span class="font-mono text-sm"
                    :class="k.failure_count > 0 ? 'text-status-error-text' : 'text-text-secondary'">
                    {{ k.failure_count }}
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <button type="button" class="row-action-btn disabled:opacity-60 disabled:cursor-not-allowed"
                  @click="handleTestKey(k)" :disabled="actionLoading || !!testingKeyId"
                  :title="testingKeyId === k.id ? 'Testing...' : (testedKeyId === k.id ? 'Test succeeded' : 'Test key')">
                  <Icon v-if="testingKeyId === k.id" icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
                  <Icon v-else :icon="testedKeyId === k.id ? 'lucide:check' : 'lucide:zap'" class="w-4 h-4"
                    :class="testedKeyId === k.id ? 'text-status-success-text' : ''" />
                </button>
                <button type="button" class="row-action-btn" @click="openResetKeyDialog(k)" :disabled="actionLoading">
                  <Icon icon="lucide:refresh-cw" class="w-4 h-4" />
                </button>
                <button type="button" class="row-action-btn row-action-btn-danger" @click="openDeleteKeyDialog(k)"
                  :disabled="actionLoading">
                  <Icon icon="lucide:trash-2" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="py-12 flex flex-col justify-center items-center gap-2">
            <Icon icon="lucide:key-round" class="w-8 h-8 opacity-20" />
            <p class="text-text-secondary">No keys found.</p>
          </div>
        </template>
      </div>

      <PaginationBar :page="page" :total="total" :limit="limit" :limit-options="limitOptions" :disabled="loading"
        @update:page="onPageChange" @update:limit="onLimitChange" />
    </div>
  </div>

  <ConfirmDialog v-model="resetAllDialogOpen" title="Reset provider stats?" confirm-text="Reset"
    :loading="actionLoading" @confirm="handleResetProviderKeys">
    <p class="text-sm text-text-secondary">
      This resets request/failure counters and last used for all keys under this provider.
    </p>
  </ConfirmDialog>

  <ConfirmDialog v-model="resetKeyDialogOpen" title="Reset key stats?" confirm-text="Reset" :loading="actionLoading"
    @confirm="handleResetKey" @cancel="clearSelectedKey">
    <p class="text-sm text-text-secondary">
      Reset <span class="font-mono text-text-primary">{{ selectedKey ? maskKey(selectedKey.key) : '' }}</span>.
    </p>
  </ConfirmDialog>

  <ConfirmDialog v-model="deleteKeyDialogOpen" title="Delete key?" confirm-text="Delete" :loading="actionLoading"
    is-danger @confirm="handleDeleteKey" @cancel="clearSelectedKey">
    <p class="text-sm text-text-secondary">
      Delete <span class="font-mono text-text-primary">{{ selectedKey ? maskKey(selectedKey.key) : '' }}</span>.
    </p>
  </ConfirmDialog>

  <ConfirmDialog v-model="addKeysDialogOpen" title="Add keys" confirm-text="Add" :loading="actionLoading"
    @confirm="handleCreateKeys" @cancel="clearAddKeys">
    <div class="space-y-3">
      <textarea v-model="addKeysText" rows="8" placeholder="Paste one key per line."
        class="w-full px-3 py-2 bg-card border border-border-subtle rounded-xl text-sm font-mono text-text-primary focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-brand/10"
        :disabled="actionLoading"></textarea>
    </div>
  </ConfirmDialog>

  <ProviderDialog v-model="showEditProviderDialog" :provider="editingProvider" :loading="savingProvider" lock-name
    @save="handleSaveProvider" />
</template>

<style scoped>
@import "@/style.css";

.icon-btn {
  @apply mt-1 p-2 text-text-secondary hover:text-text-primary hover:bg-card-hover rounded-full cursor-pointer;
}

.row-action-btn {
  @apply p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-card-hover cursor-pointer;
}

.row-action-btn-danger {
  @apply text-status-error-text hover:text-status-error-text;
}

.log-card {
  @apply bg-card border border-border-subtle rounded-2xl shadow-lg shadow-black/5;
}

.filters-icon {
  @apply pointer-events-none absolute w-4 h-4 top-1/2 -translate-y-1/2 text-text-tertiary;
}

.action-icon {
  @apply h-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer;
}

.action-secondary {
  @apply text-text-secondary border border-border-subtle font-medium hover:bg-card-hover hover:text-text-primary;
}

.action-primary {
  @apply bg-brand text-brand-on font-bold shadow-sm hover:opacity-90;
}
</style>
