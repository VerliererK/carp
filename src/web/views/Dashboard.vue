<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getStats } from '@/api';
import DashboardCard from '@/components/DashboardCard.vue';

interface StatCard {
  title: string;
  value: string | number;
  valueUnit?: string;
  valueClass?: string;
  subtext?: string;
}

const stats = ref<StatCard[]>([
  {
    title: 'Total',
    value: '--',
    subtext: 'last 24 hours',
  },
  {
    title: 'Successful',
    value: '--',
    valueClass: 'text-status-success-text',
    subtext: '0%',
  },
  {
    title: 'Failed',
    value: '--',
    valueClass: 'text-status-error-text',
    subtext: '0%',
  },
  {
    title: 'Response',
    value: '--',
    valueUnit: 'ms',
  },
]);

const formatPercent = (value: number, total: number) => {
  if (!total) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
};

onMounted(async () => {
  try {
    const data = await getStats();
    const total = data.total ?? 0;
    const success = data.success ?? 0;
    const failed = data.failed ?? 0;
    const avg = data.avg_duration ?? 0;

    stats.value = [
      { title: 'Total', value: total, subtext: 'last 24 hours' },
      { title: 'Successful', value: success, valueClass: 'text-status-success-text', subtext: formatPercent(success, total) },
      { title: 'Failed', value: failed, valueClass: 'text-status-error-text', subtext: formatPercent(failed, total) },
      { title: 'Response', value: Math.round(avg), valueUnit: 'ms' },
    ];
  } catch (error) {
    console.error('Failed to fetch stats', error);
  }
});
</script>

<template>
  <div class="space-y-8">
    <!-- Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <DashboardCard v-for="(stat, index) in stats" :key="index" :title="stat.title" :value="stat.value"
        :value-unit="stat.valueUnit" :value-class="stat.valueClass" :subtext="stat.subtext" />
    </div>
  </div>
</template>
