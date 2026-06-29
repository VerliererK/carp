<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { useToast } from '@/composables/useToast';
import { listSettings, updateSetting } from '@/api';
import { SETTING_DEFINITIONS, type SettingKey } from '@shared/settings';

const toast = useToast();

interface SettingItem {
  key: SettingKey;
  label: string;
  description: string;
  min: number;
  max: number;
  default: number;
}

interface SettingGroup {
  key: string;
  label: string;
  items: SettingItem[];
}

const settingItems: SettingItem[] = [
  {
    key: 'max_attempts',
    label: 'Max Retry Attempts',
    description: 'How many times to retry with another key when a request fails.',
    min: SETTING_DEFINITIONS.max_attempts.min,
    max: SETTING_DEFINITIONS.max_attempts.max,
    default: SETTING_DEFINITIONS.max_attempts.default,
  },
  {
    key: 'max_key_failures',
    label: 'Max Key Failures',
    description: 'Consecutive failures before a key is marked invalid.',
    min: SETTING_DEFINITIONS.max_key_failures.min,
    max: SETTING_DEFINITIONS.max_key_failures.max,
    default: SETTING_DEFINITIONS.max_key_failures.default,
  },
  {
    key: 'log_retention_days',
    label: 'Log Retention',
    description: 'How many days request logs are kept before cleanup.',
    min: SETTING_DEFINITIONS.log_retention_days.min,
    max: SETTING_DEFINITIONS.log_retention_days.max,
    default: SETTING_DEFINITIONS.log_retention_days.default,
  },
  {
    key: 'test_key_concurrency',
    label: 'Test Key Concurrency',
    description: 'Max concurrent requests when testing keys (batch test & hourly revalidation).',
    min: SETTING_DEFINITIONS.test_key_concurrency.min,
    max: SETTING_DEFINITIONS.test_key_concurrency.max,
    default: SETTING_DEFINITIONS.test_key_concurrency.default,
  },
];

const settingGroups: SettingGroup[] = [
  {
    key: 'general',
    label: 'General Settings',
    items: settingItems,
  },
];

const loading = ref(true);
const saving = reactive<Record<SettingKey, boolean>>({} as Record<SettingKey, boolean>);
const original = ref<Record<SettingKey, number>>({} as Record<SettingKey, number>);
const form = reactive<Record<SettingKey, number>>({} as Record<SettingKey, number>);
const saveTimers = new Map<SettingKey, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 600;
const appVersion = __APP_VERSION__;

const fetchSettings = async () => {
  loading.value = true;
  try {
    const data = await listSettings();
    for (const item of settingItems) {
      const val = (data[item.key] as number) ?? item.default;
      original.value[item.key] = val;
      form[item.key] = val;
    }
  } catch (e: any) {
    toast.error(e.message || 'Failed to load settings');
  } finally {
    loading.value = false;
  }
};

const saveSetting = async (key: SettingKey, nextValue = form[key]) => {
  if (saving[key]) return;
  if (nextValue === original.value[key]) return;
  saving[key] = true;
  const prevOriginal = original.value[key];
  try {
    await updateSetting(key, nextValue);
    original.value[key] = nextValue;
    toast.success('Setting saved');
  } catch (e: any) {
    toast.error(e.message || 'Failed to save setting');
    if (form[key] === nextValue) {
      form[key] = prevOriginal;
    }
  } finally {
    saving[key] = false;
  }
};

const clampValue = (item: SettingItem) => {
  const raw = Number(form[item.key]);
  if (!Number.isFinite(raw)) {
    form[item.key] = original.value[item.key] ?? item.default;
    return;
  }
  const v = raw;
  if (v < item.min) form[item.key] = item.min;
  else if (v > item.max) form[item.key] = item.max;
  else form[item.key] = v;
};

const fullDescription = (item: SettingItem) =>
  `${item.description} (range: ${item.min}~${item.max}, default: ${item.default})`;

const cancelScheduledSave = (key: SettingKey) => {
  const timer = saveTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  saveTimers.delete(key);
};

const scheduleSave = (item: SettingItem) => {
  const key = item.key;
  if (saving[key]) return;
  const value = Number(form[key]);
  if (!Number.isFinite(value)) return;

  form[key] = value;
  cancelScheduledSave(key);
  if (value === original.value[key]) return;

  saveTimers.set(
    key,
    setTimeout(() => {
      cancelScheduledSave(key);
      clampValue(item);
      void saveSetting(key);
    }, SAVE_DEBOUNCE_MS),
  );
};

const stepValue = (item: SettingItem, delta: number) => {
  form[item.key] += delta;
  scheduleSave(item);
};

const saveNow = (item: SettingItem) => {
  if (saving[item.key]) return;
  cancelScheduledSave(item.key);
  clampValue(item);
  void saveSetting(item.key);
};

onMounted(() => {
  fetchSettings();
});

onBeforeUnmount(() => {
  for (const timer of saveTimers.values()) {
    clearTimeout(timer);
  }
  saveTimers.clear();
});
</script>

<template>
  <div class="space-y-6">

    <!-- Settings Groups -->
    <div class="space-y-4">
      <section v-for="group in settingGroups" :key="group.key"
        class="bg-card border border-border-subtle rounded-2xl shadow-float p-5">
        <header class="mb-4">
          <h2 class="text-base font-semibold text-text-primary">{{ group.label }}</h2>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          <div v-for="item in group.items" :key="item.key"
            class="bg-app border border-border-subtle rounded-xl p-3 transition duration-200 ease-out"
            :class="form[item.key] !== original[item.key] ? 'ring-1 ring-brand/30 border-brand/40' : ''">
            <div class="flex items-center justify-between gap-3">
              <!-- Label -->
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="text-sm font-medium text-text-primary break-words">{{ item.label
                  }}</span>
                <div class="relative inline-flex items-center group">
                  <span tabindex="0"
                    class="inline-flex items-center text-text-tertiary hover:text-text-secondary cursor-help transition-colors duration-200 ease-out"
                    :aria-label="fullDescription(item)">
                    <Icon icon="lucide:info" class="w-4 h-4" />
                  </span>
                  <span
                    class="pointer-events-none absolute z-10 left-1/2 top-full mt-1 -translate-x-1/2 w-64 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs leading-relaxed text-text-secondary shadow-float opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-none">
                    {{ fullDescription(item) }}
                  </span>
                </div>
              </div>

              <!-- Stepper Input -->
              <div class="flex items-center gap-2 shrink-0">
                <div class="flex items-center rounded-xl border border-border-subtle overflow-hidden">
                  <button type="button"
                    class="flex items-center justify-center w-9 h-9 bg-card border-r border-border-subtle text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="form[item.key] <= item.min || saving[item.key]" @click="stepValue(item, -1)">
                    <Icon icon="lucide:minus" class="w-4 h-4" />
                  </button>
                  <input type="number" v-model.number="form[item.key]" :min="item.min" :max="item.max"
                    class="w-14 h-9 text-sm text-center font-mono font-medium text-text-primary bg-app border-r border-border-subtle outline-none focus:ring-0 disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    :disabled="saving[item.key]" @input="scheduleSave(item)" @blur="saveNow(item)"
                    @keydown.enter.prevent="saveNow(item)" />
                  <button type="button"
                    class="flex items-center justify-center w-9 h-9 bg-card text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="form[item.key] >= item.max || saving[item.key]" @click="stepValue(item, 1)">
                    <Icon icon="lucide:plus" class="w-4 h-4" />
                  </button>
                </div>
                <Icon v-if="saving[item.key]" icon="lucide:loader-2" class="w-4 h-4 text-text-tertiary animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <p class="px-1 text-xs text-text-tertiary font-mono">CARP v{{ appVersion }}</p>

  </div>
</template>
