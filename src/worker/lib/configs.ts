import { systemSettings } from './db';
import { SETTING_DEFINITIONS, parseRetryStatusCodes, parseSettingValue, type ManagedSettingDefinition, type SettingKey } from '@shared/settings';

async function getValue(db: D1Database, key: SettingKey): Promise<number> {
  // Widened so the guard below stays valid as non-numeric settings are added
  const config = SETTING_DEFINITIONS[key] as ManagedSettingDefinition;
  if (config.kind !== 'int' && config.kind !== 'float') {
    throw new Error(`Setting '${key}' is not numeric`);
  }

  const setting = await systemSettings.get(db, key);
  const rawValue = setting?.value ?? String(config.default);
  return parseSettingValue(rawValue, config);
}

export async function getMaxAttempts(db: D1Database): Promise<number> {
  return getValue(db, 'max_attempts');
}

export async function getMaxKeyFailures(db: D1Database): Promise<number> {
  return getValue(db, 'max_key_failures');
}

export async function getRetryStatusCodes(db: D1Database): Promise<string[]> {
  const { default: fallback } = SETTING_DEFINITIONS.retry_status_codes;
  const setting = await systemSettings.get(db, 'retry_status_codes');
  try {
    return parseRetryStatusCodes(setting?.value ?? fallback);
  } catch {
    // A malformed value in the DB must not take the proxy down
    return parseRetryStatusCodes(fallback);
  }
}

export async function getLogRetentionDays(db: D1Database): Promise<number> {
  return getValue(db, 'log_retention_days');
}

export async function getTestKeyConcurrency(db: D1Database): Promise<number> {
  return getValue(db, 'test_key_concurrency');
}
