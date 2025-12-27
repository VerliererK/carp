<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { listLogs, listProviders, type LogFilters } from '@/api';
import type { RequestLog, Provider } from '@shared/types';
import BaseModal from '@/components/BaseModal.vue';
import PaginationBar from '@/components/PaginationBar.vue';

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

// Details Modal
const showDetails = ref(false);
const selectedLog = ref<RequestLog | null>(null);

// Computed
const dateRangeError = computed(() => {
  if (!startDate.value || !endDate.value) return null;
  if (endDate.value < startDate.value) return 'Invalid date range';
  return null;
});

const offset = computed(() => (page.value - 1) * limit.value);

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

const openDetails = (log: RequestLog) => {
  selectedLog.value = log;
  showDetails.value = true;
};

const onPageChange = (next: number) => {
  page.value = next;
  fetchLogs();
};

const onLimitChange = (next: number) => {
  limit.value = next;
  page.value = 1;
  fetchLogs();
};

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
          <div class="status-badge" :class="log.success ? 'status-badge-success' : 'status-badge-error'">
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
              <span class="text-sm line-clamp-1 break-all">{{ log.error_msg }}</span>
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- Pagination -->
    <PaginationBar :page="page" :total="total" :limit="limit" :limit-options="limitOptions" :disabled="loading"
      @update:page="onPageChange" @update:limit="onLimitChange" />

    <!-- Details Modal -->
    <BaseModal v-model="showDetails" title="Details">
      <div v-if="selectedLog" class="space-y-4 pb-2">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="details-label">Time</label>
            <span class="text-text-primary font-mono">{{ formatDateTime(selectedLog.created_at) }}</span>
          </div>
          <div>
            <label class="details-label">Status</label>
            <span class="status-badge" :class="selectedLog.success ? 'status-badge-success' : 'status-badge-error'">
              {{ selectedLog.status_code }}
            </span>
          </div>
          <div>
            <label class="details-label">Provider</label>
            <span class="text-text-primary">{{ providerName(selectedLog.provider_id) }}</span>
          </div>
          <div v-if="selectedLog.model">
            <label class="details-label">Model</label>
            <div class="text-text-primary font-medium">{{ selectedLog.model }}</div>
          </div>
          <div>
            <label class="details-label">Path</label>
            <span class="text-text-primary"> {{ selectedLog.url_path }}</span>
          </div>
          <div>
            <label class="details-label">Duration</label>
            <span class="text-text-primary font-mono">{{ formatDuration(selectedLog.duration) }}</span>
          </div>
        </div>

        <div v-if="!selectedLog.success && selectedLog.error_msg">
          <label class="text-error uppercase tracking-wider block mb-2">Error Message</label>
          <div class="status-badge-error p-3 rounded-lg overflow-y-auto max-h-[180px]">
            {{ selectedLog.error_msg }}
          </div>
        </div>
      </div>
    </BaseModal>
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

.status-badge {
  @apply inline-flex items-center px-2 py-0.5 text-sm rounded-full border font-mono tabular-nums;
}

.status-badge-success {
  @apply bg-status-success text-status-success-text border-status-success-border;
}

.status-badge-error {
  @apply bg-status-error text-status-error-text border-status-error-border;
}

.details-label {
  @apply text-text-secondary uppercase tracking-wider block mb-1;
}
</style>
