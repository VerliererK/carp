<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'
import type { TimeSeriesStats } from '@shared/types'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  data: TimeSeriesStats[]
  mode?: 'hourly' | 'daily'
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  mode: undefined,
  height: 320
})

type ChartTheme = {
  success: string
  successFill: string
  failed: string
  failedFill: string
  grid: string
  ticks: string
  tooltipBg: string
  tooltipText: string
}

const chartTheme = ref<ChartTheme>({
  success: '#3b82f6',
  successFill: 'rgba(59, 130, 246, 0.1)',
  failed: '#ef4444',
  failedFill: 'rgba(239, 68, 68, 0.1)',
  grid: '#e5e7eb',
  ticks: '#6b7280',
  tooltipBg: '#ffffff',
  tooltipText: '#111827'
})

const numberFormatter = new Intl.NumberFormat('zh-TW')

const inferredMode = computed<'hourly' | 'daily'>(() => {
  if (props.mode) return props.mode
  return props.data.some(point => point.period.includes('T')) ? 'hourly' : 'daily'
})

const formatNumber = (value: number) => numberFormatter.format(value)

const parseTimestamp = (value: string) => {
  if (!value) return null
  if (value.length === 10) {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatAxisLabel = (value: string) => {
  const date = parseTimestamp(value)
  if (!date) return value
  const formatter = new Intl.DateTimeFormat('en-US', inferredMode.value === 'hourly'
    ? { hour: '2-digit', hour12: false }
    : { month: '2-digit', day: '2-digit' })
  return formatter.format(date)
}

const formatTooltipTitle = (value: string) => {
  const date = parseTimestamp(value)
  if (!date) return value
  const formatter = new Intl.DateTimeFormat('zh-TW', inferredMode.value === 'hourly'
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : { year: 'numeric', month: '2-digit', day: '2-digit' })
  return formatter.format(date)
}

// Helper to resolve CSS variables to RGB strings
const resolveCssVar = (varName: string, opacity = 1) => {
  if (typeof window === 'undefined') return `rgba(0,0,0,${opacity})`

  const temp = document.createElement('div')
  temp.style.color = `var(${varName})`
  temp.style.display = 'none'
  document.body.appendChild(temp)

  const style = window.getComputedStyle(temp)
  const color = style.color // returns "rgb(r, g, b)"
  document.body.removeChild(temp)

  if (color.startsWith('rgb')) {
    return color.replace(')', `, ${opacity})`).replace('rgb', 'rgba')
  }
  return color
}

const applyChartTheme = () => {
  if (typeof window === 'undefined') return

  chartTheme.value = {
    success: resolveCssVar('--brand-primary'),
    successFill: resolveCssVar('--brand-primary', 0.15),
    failed: resolveCssVar('--status-error-text'),
    failedFill: resolveCssVar('--status-error-text', 0.15),
    grid: resolveCssVar('--border-subtle'),
    ticks: resolveCssVar('--text-secondary'),
    tooltipBg: resolveCssVar('--bg-card'),
    tooltipText: resolveCssVar('--text-primary')
  }
}

const toRgba = (color: string, alpha: number) => {
  if (color.startsWith('rgba')) {
    const parts = color.replace('rgba(', '').replace(')', '').split(',').slice(0, 3).join(',')
    return `rgba(${parts}, ${alpha})`
  }
  if (color.startsWith('rgb(')) {
    const parts = color.replace('rgb(', '').replace(')', '')
    return `rgba(${parts}, ${alpha})`
  }
  return color
}

const createGradient = (ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }, color: string) => {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  gradient.addColorStop(0, toRgba(color, 0.3))
  gradient.addColorStop(1, toRgba(color, 0))
  return gradient
}

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.data.map(point => formatAxisLabel(point.period)),
  datasets: [
    {
      label: 'Success',
      data: props.data.map(point => point.success),
      borderColor: chartTheme.value.success,
      backgroundColor: context => {
        const { chart } = context
        const { ctx, chartArea } = chart
        if (!chartArea) return chartTheme.value.successFill
        return createGradient(ctx, chartArea, chartTheme.value.success)
      },
      pointBorderColor: '#ffffff',
      pointBackgroundColor: chartTheme.value.success,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBorderWidth: 0,
      borderWidth: 2,
      tension: 0.35,
      fill: true
    },
    {
      label: 'Failed',
      data: props.data.map(point => point.failed),
      borderColor: chartTheme.value.failed,
      backgroundColor: context => {
        const { chart } = context
        const { ctx, chartArea } = chart
        if (!chartArea) return chartTheme.value.failedFill
        return createGradient(ctx, chartArea, chartTheme.value.failed)
      },
      pointBorderColor: '#ffffff',
      pointBackgroundColor: chartTheme.value.failed,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBorderWidth: 0,
      borderWidth: 2,
      tension: 0.35,
      fill: true
    }
  ]
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      display: true,
      labels: {
        color: chartTheme.value.ticks,
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 8,
        boxHeight: 8,
        font: {
          family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
          size: 12
        }
      }
    },
    tooltip: {
      backgroundColor: chartTheme.value.tooltipBg,
      borderColor: chartTheme.value.grid,
      borderWidth: 1,
      titleColor: chartTheme.value.tooltipText,
      bodyColor: chartTheme.value.tooltipText,
      displayColors: true,
      padding: 12,
      titleFont: {
        size: 13,
        weight: 'bold'
      },
      bodyFont: {
        size: 12
      },
      callbacks: {
        title: items => {
          if (!items.length) return ''
          const [firstItem] = items
          const index = typeof firstItem?.dataIndex === 'number' ? firstItem.dataIndex : null
          if (index == null) return firstItem?.label ?? ''
          const timestamp = props.data[index]?.period
          if (!timestamp) return firstItem?.label ?? ''
          return formatTooltipTitle(timestamp)
        },
        label: context => {
          const value = typeof context.parsed.y === 'number' ? context.parsed.y : 0
          return `${context.dataset.label}：${formatNumber(value)}`
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        color: chartTheme.value.ticks,
        maxRotation: 0,
        autoSkipPadding: 12,
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: chartTheme.value.grid,
        tickLength: 0
      },
      border: {
        display: false
      },
      ticks: {
        color: chartTheme.value.ticks,
        padding: 8,
        maxTicksLimit: 6
      }
    }
  }
}))

onMounted(() => {
  // Use a small timeout to ensure styles are applied if loaded dynamically or initially
  setTimeout(applyChartTheme, 0)

  // Listen for theme changes if possible, or just re-apply on window resize/focus as a fallback
  window.addEventListener('resize', applyChartTheme)
  const observer = new MutationObserver(() => {
    applyChartTheme()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
})

watch(() => props.data, () => {
  applyChartTheme()
})
</script>

<template>
  <div class="w-full relative" :style="{ height: `${props.height}px` }">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
