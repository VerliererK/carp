import { systemSettings } from './db';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_MAX_KEY_FAILURES = 3;

export async function getMaxAttempts(db: D1Database): Promise<number> {
  const maxAttemptsSetting = await systemSettings.get(db, 'max_attempts');
  const maxAttempts = Math.max(1, parseInt(maxAttemptsSetting?.value || '') || DEFAULT_MAX_ATTEMPTS);
  return maxAttempts;
}

export async function getMaxKeyFailures(db: D1Database): Promise<number> {
  const maxKeyFailuresSetting = await systemSettings.get(db, 'max_key_failures');
  const maxKeyFailures = Math.max(1, parseInt(maxKeyFailuresSetting?.value || '') || DEFAULT_MAX_KEY_FAILURES);
  return maxKeyFailures;
}
