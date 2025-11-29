<script setup lang="ts">
interface Props {
  title: string
  value: string | number
  valueUnit?: string
  valueClass?: string
  subtext?: string
  subtextClass?: string
}

withDefaults(defineProps<Props>(), {
  valueUnit: '',
  valueClass: 'text-text-primary',
  subtextClass: 'text-text-secondary',
});

</script>

<template>
  <div class="flex flex-col gap-4 h-full bg-card border border-border-subtle rounded-2xl p-6 shadow-lg shadow-black/5">
    <h3 class="text-text-secondary text-sm font-medium uppercase tracking-wide">{{ title }}</h3>
    <div class="flex items-baseline gap-1" :class="valueClass">
      <span class="text-3xl font-semibold tracking-tight">{{ value }}</span>
      <span v-if="valueUnit" class="text-lg font-medium">{{ valueUnit }}</span>
    </div>
    <p v-if="subtext" :class="[subtextClass, 'text-sm font-medium']">{{ subtext }}</p>
  </div>
</template>
