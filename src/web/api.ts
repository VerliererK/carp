import type { RequestStats, TimeSeriesStats } from '@shared/types';
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
