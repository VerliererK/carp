import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { RequestLog } from '@shared/types';
import { providers, apiKeys, requestLogs } from '../lib/db';
import { getMaxAttempts, getMaxKeyFailures } from '../lib/configs';
import { pickRandom } from '../lib/random';
import { sanitizeHeaders } from '../lib/provider-request';

export const matchGemini = (url: string): boolean => {
  return url.match(/\/models\/[^/]+:(?:stream)?[Gg]enerateContent/) !== null;
};

export const proxyHandler = async (c: Context) => {
  const url = new URL(c.req.url);
  const providerName = c.req.param('provider');

  if (!providerName) {
    throw new HTTPException(400, { message: 'Provider is required' });
  }

  // Validate provider
  const provider = await providers.getByName(c.env.DB, providerName);
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });
  if (provider.enabled !== 1) throw new HTTPException(403, { message: 'Provider is disabled' });

  // Configuration
  const maxAttempts = await getMaxAttempts(c.env.DB);
  const maxKeyFailures = await getMaxKeyFailures(c.env.DB);
  const recordUsage = (key: number, success: boolean) => apiKeys.recordUsage(c.env.DB, key, success, maxKeyFailures);
  const logRequest = (log: Omit<RequestLog, 'id' | 'created_at'>) => c.executionCtx.waitUntil(requestLogs.create(c.env.DB, log));

  // Prepare request
  const isGemini = provider.type === 'gemini' && !url.pathname.includes('v1beta/openai');
  if (isGemini) url.searchParams.delete('key');
  const originalPath = url.pathname.slice(`/proxy/${providerName}`.length);
  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const targetUrl = `${baseUrl}${originalPath}${url.search}`;
  const headers = sanitizeHeaders(c.req.raw.headers, provider);
  const body = c.req.raw.body ? await c.req.raw.arrayBuffer() : undefined;
  const model = body ? getModel(url.pathname, body) : undefined;

  let lastError: Error | null = null;
  const excludedKeyIds = new Set<number>();

  // Retry loop
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKeyPool = await apiKeys.listLRU(c.env.DB, provider.id, { limit: 3, excludeIds: Array.from(excludedKeyIds) });
    const apiKey = pickRandom(apiKeyPool);
    if (!apiKey) {
      if (lastError) break; // Key pool exhausted by excludedKeyIds; fall through to the 502 with the upstream error
      throw new HTTPException(503, { message: 'No available API keys' });
    }

    if (isGemini) {
      headers.set('x-goog-api-key', apiKey.key);
    } else {
      headers.set('Authorization', `Bearer ${apiKey.key}`);
    }
    excludedKeyIds.add(apiKey.id); // Avoid retrying the same key within this request

    try {
      const startTime = Date.now();
      const response = await fetch(targetUrl, { method: c.req.method, headers, body });
      const duration = Date.now() - startTime;

      if (response.ok) {
        console.log(`provider '${providerName}' with key ID ${apiKey.id} succeeded in ${duration}ms.`);
        await recordUsage(apiKey.id, true);
        logRequest({ provider_id: provider.id, api_key_id: apiKey.id, url_path: originalPath, model, status_code: response.status, success: 1, duration: duration });
        return response;
      }

      const errorMsg = await extractErrorMessage(response);
      await recordUsage(apiKey.id, false);
      logRequest({ provider_id: provider.id, api_key_id: apiKey.id, url_path: originalPath, model, status_code: response.status, success: 0, duration: duration, error_msg: errorMsg });
      lastError = new Error(errorMsg || `HTTP ${response.status}`);

      if (!isRetryableStatus(response.status)) return response;
      console.log(`Attempt ${attempt + 1} for provider '${providerName}' with key ID ${apiKey.id} failed with status ${response.status}. Retrying...`);
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt + 1} for provider '${providerName}' with key ID ${apiKey.id} failed with error: ${lastError.message}`);
      // await recordUsage(apiKey.id, false);
      logRequest({ provider_id: provider.id, api_key_id: apiKey.id, url_path: originalPath, model, status_code: 0, success: 0, duration: 0, error_msg: lastError.message });
    }
  }

  // All retries exhausted
  throw new HTTPException(502, { message: lastError?.message || 'Unknown error' });
};

function isRetryableStatus(status: number): boolean {
  return status === 401 || status === 429 || status >= 500;
}

function getModel(url: string, body: ArrayBuffer): string | undefined {
  if (matchGemini(url)) {
    const match = url.match(/\/models\/([^/:]+)/);
    return match ? match[1] : undefined;
  }
  try {
    const bodyText = new TextDecoder().decode(body);
    const bodyJson = JSON.parse(bodyText) as any;
    return bodyJson.model;
  } catch {
    return undefined;
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      let errorBody = (await response.clone().json()) as any;
      if (Array.isArray(errorBody)) {
        errorBody = errorBody.map(e => e.error?.message || e.message || JSON.stringify(e)).join('; ');
        return errorBody;
      }
      return errorBody.error?.message || errorBody.message || JSON.stringify(errorBody);
    }
  } catch {
    // Cannot parse, ignore
  }
  return `HTTP ${response.status}`;
}
