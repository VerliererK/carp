<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { useToast } from '@/composables/useToast';
import { listSettings, updateSetting } from '@/api';
import { SETTING_DEFINITIONS, parseRetryStatusCodes, type SettingKey, type SettingValue } from '@shared/settings';

const toast = useToast();

interface BaseSettingItem {
  key: SettingKey;
  label: string;
  description: string;
}

interface NumberSettingItem extends BaseSettingItem {
  kind: 'number';
  min: number;
  max: number;
  default: number;
}

interface TextSettingItem extends BaseSettingItem {
  kind: 'text';
  default: string;
  normalize: (value: string) => string;
}

type SettingItem = NumberSettingItem | TextSettingItem;

interface SettingGroup {
  key: string;
  label: string;
  items: SettingItem[];
}

const settingItems: SettingItem[] = [
  {
    kind: 'number',
    key: 'max_attempts',
    label: 'Max Retry Attempts',
    description: 'How many times to retry with another key when a request fails.',
    min: SETTING_DEFINITIONS.max_attempts.min,
    max: SETTING_DEFINITIONS.max_attempts.max,
    default: SETTING_DEFINITIONS.max_attempts.default,
  },
  {
    kind: 'number',
    key: 'max_key_failures',
    label: 'Max Key Failures',
    description: 'Consecutive failures before a key is marked invalid.',
    min: SETTING_DEFINITIONS.max_key_failures.min,
    max: SETTING_DEFINITIONS.max_key_failures.max,
    default: SETTING_DEFINITIONS.max_key_failures.default,
  },
  {
    kind: 'text',
    key: 'retry_status_codes',
    label: 'Retry Status Codes',
    description: 'Response status codes that trigger a retry with another key. Comma-separated, accepts exact codes (100~599) and wildcards (1xx~5xx). Leave empty to never retry on status.',
    default: SETTING_DEFINITIONS.retry_status_codes.default,
    normalize: value => parseRetryStatusCodes(value).join(','),
  },
  {
    kind: 'number',
    key: 'log_retention_days',
    label: 'Log Retention',
    description: 'How many days request logs are kept before cleanup.',
    min: SETTING_DEFINITIONS.log_retention_days.min,
    max: SETTING_DEFINITIONS.log_retention_days.max,
    default: SETTING_DEFINITIONS.log_retention_days.default,
  },
  {
    kind: 'number',
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
const invalid = reactive<Record<SettingKey, boolean>>({} as Record<SettingKey, boolean>);
const original = ref<Record<SettingKey, SettingValue>>({} as Record<SettingKey, SettingValue>);
const form = reactive<Record<SettingKey, SettingValue>>({} as Record<SettingKey, SettingValue>);
const saveTimers = new Map<SettingKey, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 600;
const TEXT_SAVE_DEBOUNCE_MS = 1200;
const appVersion = __APP_VERSION__;

const fetchSettings = async () => {
  loading.value = true;
  try {
    const data = await listSettings();
    for (const item of settingItems) {
      const val = data[item.key] ?? item.default;
      original.value[item.key] = val;
      form[item.key] = val;
    }
  } catch (e: any) {
    toast.error(e.message || 'Failed to load settings');
  } finally {
    loading.value = false;
  }
};

const saveSetting = async (key: SettingKey, nextValue: SettingValue = form[key]) => {
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
  if (item.kind !== 'number') return;
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
  item.kind === 'number'
    ? `${item.description} (range: ${item.min}~${item.max}, default: ${item.default})`
    : `${item.description} (default: ${item.default})`;

const atMin = (item: SettingItem) => item.kind === 'number' && Number(form[item.key]) <= item.min;
const atMax = (item: SettingItem) => item.kind === 'number' && Number(form[item.key]) >= item.max;

/** Normalize a text value in place. Returns false and flags the field when it does not parse. */
const tryNormalize = (item: TextSettingItem): boolean => {
  const raw = String(form[item.key] ?? '');
  let normalized: string;
  try {
    normalized = item.normalize(raw);
  } catch {
    invalid[item.key] = true;
    return false;
  }
  invalid[item.key] = false;
  if (normalized !== raw) form[item.key] = normalized; // Only rewrite when it differs, so the caret stays put
  return true;
};

const cancelScheduledSave = (key: SettingKey) => {
  const timer = saveTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  saveTimers.delete(key);
};

const scheduleSave = (item: SettingItem) => {
  const key = item.key;
  if (saving[key]) return;

  if (item.kind === 'text') {
    cancelScheduledSave(key);
    saveTimers.set(
      key,
      setTimeout(() => {
        cancelScheduledSave(key);
        // A half-typed list just shows the error border; it saves as soon as it parses
        if (!tryNormalize(item)) return;
        void saveSetting(key);
      }, TEXT_SAVE_DEBOUNCE_MS),
    );
    return;
  }

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
  if (item.kind !== 'number') return;
  form[item.key] = Number(form[item.key]) + delta;
  scheduleSave(item);
};

const saveNow = (item: SettingItem) => {
  if (saving[item.key]) return;
  cancelScheduledSave(item.key);

  if (item.kind === 'text') {
    // Keep what was typed on screen with the error border rather than discarding it
    if (!tryNormalize(item)) return;
  } else {
    clampValue(item);
  }

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
            <div class="flex flex-col gap-2">
              <!-- Label -->
              <div class="flex items-center gap-2 min-w-0">
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
                <Icon v-if="saving[item.key]" icon="lucide:loader-2"
                  class="ml-auto w-4 h-4 shrink-0 text-text-tertiary animate-spin" />
              </div>

              <!-- Stepper Input -->
              <div v-if="item.kind === 'number'"
                class="flex items-center self-start rounded-xl border border-border-subtle overflow-hidden">
                <button type="button"
                  class="flex items-center justify-center w-9 h-9 shrink-0 bg-card border-r border-border-subtle text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="atMin(item) || saving[item.key]" @click="stepValue(item, -1)">
                  <Icon icon="lucide:minus" class="w-4 h-4" />
                </button>
                <input type="number" v-model.number="form[item.key]" :min="item.min" :max="item.max"
                  class="w-14 h-9 text-sm text-center font-mono font-medium text-text-primary bg-app border-r border-border-subtle outline-none focus:ring-0 disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  :disabled="saving[item.key]" @input="scheduleSave(item)" @blur="saveNow(item)"
                  @keydown.enter.prevent="saveNow(item)" />
                <button type="button"
                  class="flex items-center justify-center w-9 h-9 shrink-0 bg-card text-text-secondary hover:bg-card-hover hover:text-text-primary cursor-pointer transition duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="atMax(item) || saving[item.key]" @click="stepValue(item, 1)">
                  <Icon icon="lucide:plus" class="w-4 h-4" />
                </button>
              </div>

              <!-- Text Input -->
              <input v-else type="text" v-model="form[item.key]" :placeholder="item.default" spellcheck="false"
                :title="String(form[item.key] ?? '')"
                class="w-full h-9 px-3 text-sm font-mono text-text-primary bg-app border rounded-xl outline-none transition duration-200 ease-out disabled:opacity-60"
                :class="invalid[item.key] ? 'border-status-error-border' : 'border-border-subtle focus:border-brand/40'"
                :disabled="saving[item.key]" @input="scheduleSave(item)" @blur="saveNow(item)"
                @keydown.enter.prevent="saveNow(item)" />
            </div>
          </div>
        </div>
      </section>
    </div>

    <p class="px-1 text-xs text-text-tertiary font-mono">CARP v{{ appVersion }}</p>

  </div>
</template>
