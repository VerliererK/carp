<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getStats, getStatsTimeseries } from '@/api';
import type { TimeSeriesStats } from '@shared/types';
import DashboardCard from '@/components/DashboardCard.vue';
import StatsChart from '@/components/StatsChart.vue';

interface StatCard {
  title: string;
  value: string | number;
  valueUnit?: string;
  valueClass?: string;
  subtext?: string;
}

const period = ref<'24h' | '7d'>('24h');

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

const trendData = ref<TimeSeriesStats[]>([]);

const formatPercent = (value: number, total: number) => {
  if (!total) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
};

const fetchData = async (p: '24h' | '7d') => {
  try {
    const [statsData, timeseriesData] = await Promise.all([
      getStats(p),
      getStatsTimeseries(p)
    ]);

    // Update Stats Cards
    const total = statsData.total ?? 0;
    const success = statsData.success ?? 0;
    const failed = statsData.failed ?? 0;
    const avg = statsData.avg_duration ?? 0;
    const periodText = p === '24h' ? 'last 24 hours' : 'last 7 days';

    stats.value = [
      { title: 'Total', value: total, subtext: periodText },
      { title: 'Successful', value: success, valueClass: 'text-status-success-text', subtext: formatPercent(success, total) },
      { title: 'Failed', value: failed, valueClass: 'text-status-error-text', subtext: formatPercent(failed, total) },
      { title: 'Response', value: Math.round(avg), valueUnit: 'ms' },
    ];

    // Update Chart
    trendData.value = timeseriesData;

  } catch (error) {
    console.error('Failed to fetch dashboard data', error);
  }
};

const setPeriod = (p: '24h' | '7d') => {
  if (period.value === p) return;
  period.value = p;
  fetchData(p);
};

onMounted(() => {
  fetchData(period.value);
});
</script>

<template>
  <div class="space-y-8">
    <!-- Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
      <DashboardCard v-for="(stat, index) in stats" :key="index" :title="stat.title" :value="stat.value"
        :value-unit="stat.valueUnit" :value-class="stat.valueClass" :subtext="stat.subtext" />
    </div>

    <!-- Charts -->
    <div class="bg-card border border-border-subtle rounded-2xl p-6">
      <div class="flex justify-end">
        <div class="flex items-center gap-1 rounded-lg bg-card-hover p-1">
          <button v-for="option in ([{ value: '24h', label: '24 Hours' }, { value: '7d', label: '7 Days' }] as const)"
            :key="option.value" @click="setPeriod(option.value)"
            class="cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-all outline-none"
            :class="period === option.value ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'">
            {{ option.label }}
          </button>
        </div>
      </div>
      <StatsChart :data="trendData" :mode="period === '24h' ? 'hourly' : 'daily'" :height="360" />
    </div>
  </div>
</template>
