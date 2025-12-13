<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { listLogs, listProviders, type LogFilters } from '@/api';
import type { RequestLog, Provider } from '@shared/types';

// State
const logs = ref<RequestLog[]>([]);
const providers = ref<Provider[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

// Filters
const provider = ref<number | 'all'>('all');
const status = ref<'all' | 'success' | 'failed'>('all');
const startDate = ref('');
const endDate = ref('');

// Pagination
const page = ref(1);
const limit = ref(20);
const limitOptions = [10, 20, 50, 100] as const;

// Computed
const dateRangeError = computed(() => {
  if (!startDate.value || !endDate.value) return null;
  if (endDate.value < startDate.value) return 'Invalid date range';
  return null;
});

const totalPages = computed(() => {
  const safeLimit = Math.max(1, limit.value || 1);
  const pages = Math.ceil((total.value || 0) / safeLimit);
  return Math.max(1, pages);
});

const offset = computed(() => (page.value - 1) * limit.value);

const paginationItems = computed(() => {
  const pages = totalPages.value;
  const current = Math.min(Math.max(1, page.value), pages);
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => ({ type: 'page' as const, value: i + 1 }));
  }

  const items: Array<{ type: 'page'; value: number } | { type: 'gap'; key: string }> = [];
  const pushGap = (key: string) => items.push({ type: 'gap', key });
  const pushPage = (value: number) => items.push({ type: 'page', value });

  pushPage(1);

  const left = Math.max(2, current - 1);
  const right = Math.min(pages - 1, current + 1);

  if (left > 2) pushGap('left');
  for (let p = left; p <= right; p++) pushPage(p);
  if (right < pages - 1) pushGap('right');

  pushPage(pages);

  return items;
});

// Methods
const fetchProviders = async () => {
  try {
    const data = await listProviders();
    providers.value = data;
  } catch (err) {
    console.error('Failed to fetch providers', err);
  }
};

const fetchLogs = async () => {
  if (dateRangeError.value) return;
  loading.value = true;
  error.value = null;

  try {
    const filters: LogFilters = {};
    filters.limit = limit.value;
    filters.offset = offset.value;
    if (provider.value !== 'all') filters.provider_id = provider.value;
    if (status.value === 'success') filters.success = true;
    if (status.value === 'failed') filters.success = false;
    if (startDate.value) filters.start_date = startDate.value;
    if (endDate.value) filters.end_date = endDate.value;

    const res = await listLogs(filters);
    logs.value = res.logs;
    total.value = res.total;
  } catch (err) {
    error.value = 'Failed to load logs. Please try again.';
    console.error(err);
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  page.value = 1;
  fetchLogs();
};

const resetFilters = () => {
  provider.value = 'all';
  status.value = 'all';
  startDate.value = '';
  endDate.value = '';
  page.value = 1;
};

const providerName = (id: number) => {
  const provider = providers.value.find(p => p.id === id);
  return provider?.name || `#${id}`;
}

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString('zh', { hour12: false }).replace(',', '');
};

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms)) return '--';
  return `${Math.round(ms)} ms`;
};

const statusBadgeText = (log: RequestLog) => {
  if (Number.isFinite(log.status_code) && log.status_code > 0) return String(log.status_code);
  return 'ERR';
};

const mobileTitle = (log: RequestLog) => (log.model || log.url_path);

const mobileSubtitle = (log: RequestLog) => {
  const name = providerName(log.provider_id);
  return log.model ? `${name} · ${log.url_path}` : name;
};

const openDetails = (log: RequestLog) => { };

const goToPage = (next: number) => {
  const clamped = Math.min(Math.max(1, next), totalPages.value);
  if (clamped === page.value) return;
  page.value = clamped;
  fetchLogs();
};

watch(limit, () => {
  applyFilters();
});

watch([provider, status], () => {
  page.value = 1;
  fetchLogs();
});

onMounted(() => {
  fetchProviders();
  fetchLogs();
});
</script>

<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="log-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4">
      <!-- Provider -->
      <div class="relative">
        <Icon icon="lucide:network" class="filters-icon left-3" />
        <select v-model="provider" :disabled="loading" class="filters-input pr-9">
          <option value="all">All</option>
          <option v-for="p in providers" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <Icon icon="lucide:chevron-down" class="filters-icon right-3" />
      </div>

      <div class="relative">
        <Icon icon="lucide:badge-check" class="filters-icon left-3" />
        <select v-model="status" :disabled="loading" class="filters-input pr-9">
          <option value="all">All</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <Icon icon="lucide:chevron-down" class="filters-icon right-3" />
      </div>

      <div class="relative">
        <Icon icon="lucide:calendar" class="filters-icon left-3" />
        <input v-model="startDate" type="date" :disabled="loading" class="filters-input pr-2"
          :class="dateRangeError ? 'filters-input--error' : ''" />
      </div>

      <div class="relative">
        <Icon icon="lucide:calendar" class="filters-icon left-3" />
        <input v-model="endDate" type="date" :disabled="loading" class="filters-input pr-2"
          :class="dateRangeError ? 'filters-input--error' : ''" />
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button @click="resetFilters" :disabled="loading" class="filters-btn" title="Reset">
          <Icon icon="lucide:rotate-ccw" class="w-5 h-5" />
        </button>
        <button @click="applyFilters" :disabled="loading || !!dateRangeError" class="filters-btn" title="Filter">
          <Icon :icon="loading ? 'lucide:loader-2' : 'lucide:filter'" class="w-5 h-5"
            :class="loading ? 'animate-spin' : ''" />
        </button>
      </div>

    </div>

    <!-- Desktop Table -->
    <div class="log-card overflow-hidden hidden md:block">
      <table class="w-full text-left">
        <thead class="border-b border-border-subtle">
          <tr>
            <th class="px-4 py-3 font-medium text-text-secondary">Time</th>
            <th class="px-4 py-3 font-medium text-text-secondary">Provider</th>
            <th class="px-4 py-3 font-medium text-text-secondary">Model/Path</th>
            <th class="px-4 py-3 font-medium text-text-secondary">Status</th>
            <th class="px-4 py-3 font-medium text-text-secondary">Duration</th>
            <th class="px-4 py-3 font-medium text-text-secondary">Error</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-card-hover cursor-pointer" @click="openDetails(log)">
            <td class="px-4 py-3 font-mono text-text-secondary w-[60px]">
              {{ formatDateTime(log.created_at) }}
            </td>
            <td class="px-4 py-3 font-medium text-text-primary">
              {{ providerName(log.provider_id) }}
            </td>
            <td class="px-4 py-3" :title="log.url_path">
              <div class="flex flex-col">
                <span class="text-text-primary font-medium">{{ log.model || '-' }}</span>
                <span class="text-text-secondary">{{ log.url_path }}</span>
              </div>
            </td>
            <td class="px-4 py-3 font-mono font-medium whitespace-nowrap"
              :class="log.success ? 'text-status-success-text' : 'text-status-error-text'">
              {{ log.status_code }}
            </td>
            <td class="px-4 py-3 font-mono text-text-secondary whitespace-nowrap">
              {{ formatDuration(log.duration) }}
            </td>
            <td class="px-4 py-3 text-status-error-text max-w-[240px]">
              <span v-if="!log.success" class="line-clamp-2" :title="log.error_msg || ''">
                {{ log.error_msg || '' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile List -->
    <div class="log-card md:hidden divide-y divide-border-subtle">
      <button v-for="log in logs" :key="log.id" type="button" class="w-full text-left p-4 hover:bg-card-hover"
        @click="openDetails(log)">
        <div class="flex items-start gap-3">
          <div class="px-2 py-0.5 text-sm rounded-full border font-mono tabular-nums"
            :class="log.success ? 'bg-status-success text-status-success-text border-status-success-border' : 'bg-status-error text-status-error-text border-status-error-border'">
            {{ statusBadgeText(log) }}
          </div>

          <div class="flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-medium text-text-primary truncate" :title="mobileTitle(log)">
                  {{ mobileTitle(log) }}
                </div>
                <div class="text-text-secondary line-clamp-1" :title="mobileSubtitle(log)">
                  {{ mobileSubtitle(log) }}
                </div>
              </div>
            </div>

            <div class="mt-1 text-sm text-text-tertiary font-mono tabular-nums">
              {{ formatDateTime(log.created_at) }} · {{ formatDuration(log.duration) }}
            </div>

            <div v-if="!log.success && (log.error_msg || '').trim()"
              class="mt-2 flex items-center gap-2 rounded-xl bg-status-error/50 border border-status-error-border px-2.5 py-2 text-status-error-text"
              :title="log.error_msg || ''">
              <Icon icon="lucide:triangle-alert" class="w-4 h-4 shrink-0" />
              <span class="line-clamp-1 break-all">{{ log.error_msg }}</span>
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- Pagination -->
    <div class="flex pt-2 border-t border-border-subtle">
      <div class="flex items-center">
        <button class="pagination-btn" :disabled="loading || page <= 1" @click="goToPage(page - 1)"
          aria-label="Previous">
          <Icon icon="lucide:chevron-left" class="w-4 h-4" />
        </button>

        <div class="flex items-center gap-1">
          <template v-for="item in paginationItems" :key="item.type === 'page' ? item.value : item.key">
            <button v-if="item.type === 'page'" class="pagination-page"
              :class="item.value === page ? 'pagination-page--active' : ''" :disabled="loading"
              @click="goToPage(item.value)" :aria-label="`Page ${item.value}`">
              {{ item.value }}
            </button>
            <div v-else class="pagination-gap" aria-hidden="true">
              <Icon icon="lucide:more-horizontal" class="w-4 h-4" />
            </div>
          </template>
        </div>

        <button class="pagination-btn" :disabled="loading || page >= totalPages" @click="goToPage(page + 1)"
          aria-label="Next">
          <Icon icon="lucide:chevron-right" class="w-4 h-4" />
        </button>
      </div>

      <!-- Limit -->
      <div class="block relative ml-1">
        <Icon icon="lucide:list" class="pagination-select-icon left-2" />
        <select v-model.number="limit" :disabled="loading" class="pagination-select pr-6" aria-label="Limit">
          <option v-for="n in limitOptions" :key="n" :value="n">
            {{ n }}
          </option>
        </select>
        <Icon icon="lucide:chevron-down" class="pagination-select-icon right-2" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "@/style.css";

.log-card {
  @apply bg-card border border-border-subtle rounded-2xl shadow-lg shadow-black/5;
}

.filters-icon {
  @apply pointer-events-none absolute w-4 h-4 top-1/2 -translate-y-1/2 text-text-tertiary;
}

.filters-input {
  @apply w-full py-2.5 pl-9 bg-app border border-border-subtle rounded-xl text-text-primary appearance-none outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-60 disabled:cursor-not-allowed;
}

.filters-input--error {
  @apply border-status-error-border focus:border-status-error-border focus:ring-status-error-border;
}

.filters-btn {
  @apply p-2 rounded-full hover:bg-card-hover text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed
}

.pagination-btn {
  @apply h-6 w-6 inline-flex items-center justify-center rounded-full text-text-secondary hover:bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors;
}

.pagination-page {
  @apply h-6 w-6 p-4 inline-flex items-center justify-center rounded-full text-text-secondary hover:bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono tabular-nums;
}

.pagination-page--active {
  @apply bg-card-hover font-medium text-text-primary border-border-focus;
}

.pagination-gap {
  @apply h-6 w-6 inline-flex items-center justify-center text-text-tertiary;
}

.pagination-select-icon {
  @apply pointer-events-none absolute w-4 h-4 top-1/2 -translate-y-1/2 text-text-tertiary;
}

.pagination-select {
  @apply h-9 pl-8 bg-card border border-border-subtle rounded-xl text-text-secondary appearance-none outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono tabular-nums;
}
</style>
