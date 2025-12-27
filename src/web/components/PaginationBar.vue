<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

type PaginationItem = { type: 'page'; value: number } | { type: 'gap'; key: string };

const props = withDefaults(defineProps<{
  page: number;
  total: number;
  limit: number;
  limitOptions?: readonly number[];
  disabled?: boolean;
  showLimit?: boolean;
}>(), {
  limitOptions: () => [10, 20, 50, 100],
  disabled: false,
  showLimit: true,
});

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:limit', value: number): void;
}>();

const totalPages = computed(() => {
  const safeLimit = Math.max(1, props.limit || 1);
  const pages = Math.ceil((props.total || 0) / safeLimit);
  return Math.max(1, pages);
});

const paginationItems = computed((): PaginationItem[] => {
  const pages = totalPages.value;
  const current = Math.min(Math.max(1, props.page), pages);
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => ({ type: 'page' as const, value: i + 1 }));
  }

  const items: PaginationItem[] = [];
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

const goToPage = (next: number) => {
  const clamped = Math.min(Math.max(1, next), totalPages.value);
  if (clamped === props.page) return;
  emit('update:page', clamped);
};

const onLimitChange = (e: Event) => {
  const target = e.target as HTMLSelectElement | null;
  const next = Number(target?.value ?? props.limit);
  const safe = Number.isFinite(next) && next > 0 ? next : props.limit;
  if (safe === props.limit) return;
  emit('update:limit', safe);
};
</script>

<template>
  <div class="flex pt-2 border-t border-border-subtle">
    <div class="flex items-center">
      <button class="pagination-btn" :disabled="disabled || page <= 1" @click="goToPage(page - 1)"
        aria-label="Previous">
        <Icon icon="lucide:chevron-left" class="w-4 h-4" />
      </button>

      <div class="flex items-center gap-1">
        <template v-for="item in paginationItems" :key="item.type === 'page' ? item.value : item.key">
          <button v-if="item.type === 'page'" class="pagination-page"
            :class="item.value === page ? 'pagination-page--active' : ''" :disabled="disabled"
            @click="goToPage(item.value)" :aria-label="`Page ${item.value}`">
            {{ item.value }}
          </button>
          <div v-else class="pagination-gap" aria-hidden="true">
            <Icon icon="lucide:more-horizontal" class="w-4 h-4" />
          </div>
        </template>
      </div>

      <button class="pagination-btn" :disabled="disabled || page >= totalPages" @click="goToPage(page + 1)"
        aria-label="Next">
        <Icon icon="lucide:chevron-right" class="w-4 h-4" />
      </button>
    </div>

    <div v-if="showLimit" class="block relative ml-1">
      <Icon icon="lucide:list" class="pagination-select-icon left-2" />
      <select :value="limit" :disabled="disabled" class="pagination-select pr-6" aria-label="Limit"
        @change="onLimitChange">
        <option v-for="n in limitOptions" :key="n" :value="n">
          {{ n }}
        </option>
      </select>
      <Icon icon="lucide:chevron-down" class="pagination-select-icon right-2" />
    </div>
  </div>
</template>

<style scoped>
@import "@/style.css";

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
