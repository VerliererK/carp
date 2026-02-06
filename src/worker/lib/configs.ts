import { systemSettings } from './db';
import { SETTING_DEFINITIONS, parseSettingValue, type SettingKey } from '@shared/settings';

async function getValue(db: D1Database, key: SettingKey): Promise<number> {
  const config = SETTING_DEFINITIONS[key];
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

export async function getLogRetentionDays(db: D1Database): Promise<number> {
  return getValue(db, 'log_retention_days');
}
