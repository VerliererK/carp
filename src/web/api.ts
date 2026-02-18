import type { RequestStats, TimeSeriesStats, RequestLog } from '@shared/types';
import type { SettingKey, SettingsPayload } from '@shared/settings';
import type { Provider, ProviderWithKeyCounts, ApiKey, Model, ModelMapping, ModelMappingWithProvider } from '@shared/types';
import { getToken, removeToken } from './auth';

const API_BASE = '/api/admin';

const withAuthHeaders = (headers?: HeadersInit) => {
  const merged = new Headers(headers ?? {});
  const token = getToken();
  if (token) {
    merged.set('Authorization', `Bearer ${token}`);
  }
  return merged;
};

const authorizedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = withAuthHeaders(init.headers);
  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    removeToken();
    window.location.reload();
  }

  return response;
};

// ========== DashBoard API ==========

export async function getStats(period: '24h' | '7d' = '24h'): Promise<RequestStats> {
  const response = await authorizedFetch(`${API_BASE}/stats?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch log stats');
  return await response.json();
}

export async function getStatsTimeseries(period: '24h' | '7d' = '24h'): Promise<TimeSeriesStats[]> {
  const response = await authorizedFetch(`${API_BASE}/stats/timeseries?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch log time series stats');
  return await response.json();
}

// ========== Providers API ==========

export async function listProviders(): Promise<ProviderWithKeyCounts[]> {
  const response = await authorizedFetch(`${API_BASE}/providers`);
  if (!response.ok) throw new Error('Failed to fetch providers');
  return await response.json();
}

export async function createProvider(data: Omit<Provider, 'id'>): Promise<Provider> {
  const response = await authorizedFetch(`${API_BASE}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to create provider');
  }
  const result = await response.json();
  return result.provider;
}

export async function getProvider(name: string): Promise<ProviderWithKeyCounts> {
  const response = await authorizedFetch(`${API_BASE}/providers/${name}`);
  if (!response.ok) throw new Error('Provider not found');
  return await response.json();
}

export async function updateProvider(name: string, data: Partial<Omit<Provider, 'id'>>): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to update provider');
  }
}

export async function toggleProvider(name: string, enabled: boolean): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to toggle provider');
  }
}

export async function deleteProvider(name: string): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${name}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete provider');
}

export async function listProviderModels(providerName: string, providerType: string): Promise<any> {
  let url = `/proxy/${providerName}/v1/models`;
  if (providerType === 'gemini') url = `/proxy/${providerName}/v1beta/models`;
  const response = await authorizedFetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.error?.message || error?.message || 'Failed to fetch models');
  }
  const json = await response.json();
  if (!json) throw new Error('Invalid response from provider');

  if (Array.isArray(json.data)) {
    return json.data.map((m: any) => m.id).filter(Boolean);
  }
  if (Array.isArray(json.models)) {
    return json.models.map((m: any) => m.name.replace('models/', '')).filter(Boolean);
  }
  return json;
}

// ========== Provider Keys API ==========

export interface KeysResponse {
  keys: ApiKey[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    total: number;
    active: number;
    invalid: number;
    total_requests: number;
    total_failures: number;
  };
}

export async function listKeys(
  providerName: string,
  filters?: { limit?: number; offset?: number; q?: string; status?: 'active' | 'invalid' | 'all'; sort?: string; order?: 'asc' | 'desc' }
): Promise<KeysResponse> {
  const params = new URLSearchParams();
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  if (filters?.q) params.append('q', filters.q);
  if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters?.sort) params.append('sort', filters.sort);
  if (filters?.order) params.append('order', filters.order);

  const url = `${API_BASE}/providers/${providerName}/keys${params.toString() ? '?' + params.toString() : ''}`;
  const response = await authorizedFetch(url);
  if (!response.ok) throw new Error('Failed to fetch keys');
  return await response.json();
}

export async function createKeys(providerName: string, keys: string[]): Promise<{ keys: ApiKey[]; message: string }> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keys),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to create keys');
  }
  return await response.json();
}

export async function getKey(providerName: string, keyId: number): Promise<ApiKey> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/${keyId}`);
  if (!response.ok) throw new Error('Key not found');
  const result = await response.json();
  return result.key;
}

export async function updateKey(providerName: string, keyId: number, data: Partial<ApiKey>): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/${keyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to update key');
  }
}

export async function deleteKey(providerName: string, keyId: number): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/${keyId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete key');
}

export async function deleteKeys(providerName: string, keys: string[]): Promise<{ message: string }> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keys),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error.error || 'Failed to delete keys');
  }
  return await response.json();
}

export async function resetProviderKeys(providerName: string): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.error || 'Failed to reset provider keys');
  }
}

export async function resetKey(providerName: string, keyId: number): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/${keyId}/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.error || 'Failed to reset key');
  }
}

export async function testKey(providerName: string, keyId: number): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/${keyId}/test`);
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.error || 'Failed to test key');
  }
}

export async function testKeysBatch(providerName: string, cursor: number, limit = 20, status?: 'active' | 'invalid')
  : Promise<{ next_cursor: number | null; success: number; fail: number; }> {
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/test-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor, limit, status }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.error || error?.message || 'Failed to batch test keys');
  }
  return await response.json();
}

export async function exportKeys(providerName: string, status?: 'active' | 'invalid'): Promise<void> {
  const queryString = status ? `?status=${status}` : '';
  const response = await authorizedFetch(`${API_BASE}/providers/${providerName}/keys/export${queryString}`);
  if (!response.ok) {
    const error = await response.json().catch(() => { });
    throw new Error(error?.message || 'Failed to export keys');
  }

  const filename = `${providerName}-keys${status ? '-' + status : ''}.txt`;
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

// ========== Logs API ==========

export interface LogsResponse {
  logs: RequestLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogFilters {
  limit?: number;
  offset?: number;
  provider_id?: number;
  success?: boolean;
  start_date?: string;
  end_date?: string;
}

export async function listLogs(filters?: LogFilters): Promise<LogsResponse> {
  const params = new URLSearchParams();
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  if (filters?.provider_id) params.append('provider_id', filters.provider_id.toString());
  if (filters?.success !== undefined) params.append('success', filters.success.toString());
  if (filters?.start_date) params.append('start_date', filters.start_date);
  if (filters?.end_date) params.append('end_date', filters.end_date);

  const url = `${API_BASE}/logs${params.toString() ? '?' + params.toString() : ''}`;
  const response = await authorizedFetch(url);
  if (!response.ok) throw new Error('Failed to fetch logs');
  return await response.json();
}

export async function clearLogs(): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/logs`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to clear logs');
}

// ========== Settings API ==========

export async function listSettings(): Promise<SettingsPayload> {
  const response = await authorizedFetch(`${API_BASE}/settings`);
  if (!response.ok) throw new Error('Failed to fetch settings');
  return await response.json();
}

export async function updateSetting(key: SettingKey, value: number): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) throw new Error('Failed to update settings');
}

// ========== Models API ==========

export async function listModels(): Promise<(Model & { mappings_count: number })[]> {
  const response = await authorizedFetch(`${API_BASE}/models`);
  if (!response.ok) throw new Error('Failed to fetch models');
  return await response.json();
}

export async function createModel(data: { name: string; enabled?: boolean }): Promise<Model> {
  const response = await authorizedFetch(`${API_BASE}/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create model');
  }
  const result = await response.json();
  return result.model;
}

export async function getModel(name: string): Promise<Model & { mappings: ModelMappingWithProvider[] }> {
  const response = await authorizedFetch(`${API_BASE}/models/${name}`);
  if (!response.ok) throw new Error('Model not found');
  return await response.json();
}

export async function updateModel(name: string, data: { name?: string; enabled?: boolean }): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/models/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update model');
  }
}

export async function deleteModel(name: string): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/models/${name}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete model');
}

export async function createModelMapping(
  modelName: string,
  data: { provider_id: number; model_name: string },
): Promise<ModelMapping> {
  const response = await authorizedFetch(`${API_BASE}/models/${modelName}/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create mapping');
  }
  const result = await response.json();
  return result.mapping;
}

export async function updateModelMapping(
  modelName: string,
  mappingId: number,
  data: { provider_id?: number; model_name?: string },
): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/models/${modelName}/mappings/${mappingId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update mapping');
  }
}

export async function deleteModelMapping(modelName: string, mappingId: number): Promise<void> {
  const response = await authorizedFetch(`${API_BASE}/models/${modelName}/mappings/${mappingId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete mapping');
}
