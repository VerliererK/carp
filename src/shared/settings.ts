export type ManagedSettingDefinition =
  | { kind: 'int'; default: number; min: number; max: number }
  | { kind: 'float'; default: number; min: number; max: number }
  | { kind: 'string'; default: string; minLength?: number; maxLength?: number }
  | { kind: 'boolean'; default: boolean };
export type NumericSettingDefinition = Extract<ManagedSettingDefinition, { kind: 'int' | 'float' }>;

export const SETTING_DEFINITIONS = {
  max_attempts: { kind: 'int', default: 3, min: 1, max: 10 },
  max_key_failures: { kind: 'int', default: 3, min: 1, max: 10 },
  retry_status_codes: { kind: 'string', default: '401,429,5xx', maxLength: 100 },
  log_retention_days: { kind: 'int', default: 7, min: 1, max: 365 },
  test_key_concurrency: { kind: 'int', default: 5, min: 1, max: 100 },
} satisfies Record<string, ManagedSettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue = string | number | boolean;
export type SettingsPayload = Partial<Record<SettingKey, SettingValue>>;

export function parseSettingValue(rawValue: string, definition: NumericSettingDefinition): number;
export function parseSettingValue(rawValue: string, definition: Extract<ManagedSettingDefinition, { kind: 'string' }>): string;
export function parseSettingValue(rawValue: string, definition: Extract<ManagedSettingDefinition, { kind: 'boolean' }>): boolean;
export function parseSettingValue(rawValue: string, definition: ManagedSettingDefinition): SettingValue;
export function parseSettingValue(rawValue: string, definition: ManagedSettingDefinition): string | number | boolean {
  if (definition.kind === 'boolean') {
    return rawValue === 'true';
  }

  if (definition.kind === 'string') {
    return rawValue;
  }

  const parsed = definition.kind === 'int'
    ? Number.parseInt(rawValue, 10)
    : Number.parseFloat(rawValue);
  const fallback = Number.isFinite(parsed) ? parsed : definition.default;
  return Math.max(definition.min, Math.min(definition.max, fallback));
}

// Retry status codes: comma-separated list of exact codes (100~599) or wildcards (1xx~5xx)
const RETRY_TOKEN_RE = /^(?:[1-5]xx|[1-5]\d{2})$/;

/** Parse '401,429,5xx' into normalized tokens (trimmed, lowercased, deduped). Throws on an invalid token. */
export function parseRetryStatusCodes(rawValue: string): string[] {
  const tokens = rawValue.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  for (const token of tokens) {
    if (!RETRY_TOKEN_RE.test(token)) {
      throw new Error(`Invalid retry status code '${token}'. Use a status code (100~599) or a wildcard (1xx~5xx).`);
    }
  }
  return [...new Set(tokens)];
}

/** Check whether a status code matches any token, by exact value or by its `Nxx` class. */
export function matchesRetryStatus(status: number, tokens: string[]): boolean {
  return tokens.includes(String(status)) || tokens.includes(`${Math.floor(status / 100)}xx`);
}
