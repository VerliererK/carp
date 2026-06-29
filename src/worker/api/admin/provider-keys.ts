import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { providers, apiKeys } from '../../lib/db';
import { getMaxKeyFailures, getTestKeyConcurrency } from '../../lib/configs';
import type { Provider, ApiKey } from '@shared/types';
import { testProvider } from '../../lib/provider-request';

const app = new Hono<{ Bindings: Env, Variables: { provider: Provider } }>();

// Middleware to get provider by name and attach to context
app.use('*', async (c, next) => {
  const providerName = c.req.param('name');
  if (!providerName) {
    throw new HTTPException(400, { message: 'Provider name is required' });
  }
  const provider = await providers.getByName(c.env.DB, providerName);
  if (!provider) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }
  c.set('provider', provider);
  await next();
});

// GET /providers/:name/keys
// limit: Number of records to return (default: 100)
// offset: Pagination offset (default: 0)
// q: Search key substring
// status: Filter by key status (active/invalid)
// sort: status/key/total_count/failure_count/last_used (default: last_used)
// order: asc/desc (default: desc)
app.get('/', async (c) => {
  const provider = c.get('provider');
  const query = c.req.query();

  const limit = parseInt(query.limit || '100');
  if (isNaN(limit) || limit <= 0 || limit > 100) throw new HTTPException(400, { message: "Invalid parameter 'limit': must be between 1 and 100" });

  const offset = parseInt(query.offset || '0');
  if (isNaN(offset) || offset < 0) throw new HTTPException(400, { message: "Invalid parameter 'offset': must be greater than or equal to 0" });

  const options: any = {
    limit,
    offset
  };

  if (query.status) {
    const status = query.status.trim().toLowerCase();
    if (status !== 'active' && status !== 'invalid') throw new HTTPException(400, { message: "Invalid parameter 'status': must be 'active' or 'invalid'" });
    options.status = status;
  }

  if (query.sort) {
    const sort = query.sort.trim().toLowerCase();
    const sortType = ['status', 'key', 'total_count', 'failure_count', 'last_used'];
    const allowedSort = new Set(sortType);
    if (!allowedSort.has(sort)) throw new HTTPException(400, { message: `Invalid parameter 'sort': must be one of ${sortType.join(',')}` });
    options.sort = sort;
  }

  if (query.order) {
    const order = query.order.trim().toLowerCase();
    if (order !== 'asc' && order !== 'desc') throw new HTTPException(400, { message: "Invalid parameter 'order': must be 'asc' or 'desc'" });
    options.order = order;
  }

  if (query.q) {
    const q = query.q.trim();
    if (q.length > 200) throw new HTTPException(400, { message: "Invalid parameter 'q': must be 200 characters or less" });
    options.q = q;
  }

  const [result, summary] = await Promise.all([
    apiKeys.listWithFilters(c.env.DB, provider.id, options),
    apiKeys.summaryByProvider(c.env.DB, provider.id),
  ]);

  return c.json({
    keys: result.keys,
    total: result.total,
    limit,
    offset,
    summary,
  });
});

// GET /providers/:name/keys/export
app.get('/export', async (c) => {
  const provider = c.get('provider');
  const query = c.req.query();
  const status = query.status as 'active' | 'invalid' | undefined;
  if (status && status !== 'active' && status !== 'invalid') {
    throw new HTTPException(400, { message: "Invalid parameter 'status': must be 'active' or 'invalid'" });
  }

  const allKeys = await apiKeys.list(c.env.DB, provider.id, status);
  const textContent = allKeys.map(k => k.key).join('\n');

  return new Response(textContent, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
});

// POST /providers/:name/keys
app.post('/', async (c) => {
  const provider = c.get('provider');
  const body = await c.req.json();  // string[]

  if (!Array.isArray(body)) {
    throw new HTTPException(400, { message: 'Request body must be an array of API key strings.' });
  }

  const keysToCreate = body.map((key: string) => ({
    key,
    provider_id: provider.id
  } as ApiKey));

  const createdKeys = await apiKeys.create(c.env.DB, keysToCreate);
  const createdCount = createdKeys.length;
  const skippedCount = keysToCreate.length - createdCount;

  return c.json({
    keys: createdKeys,
    message: `Created ${createdCount} API Keys, skipped ${skippedCount} duplicates.`
  }, 201);
});

// POST /providers/:name/keys/delete
app.post('/delete', async (c) => {
  const provider = c.get('provider');
  const body = await c.req.json();  // string[]

  if (!Array.isArray(body)) {
    throw new HTTPException(400, { message: 'Request body must be an array of API key strings.' });
  }

  const keysToDelete = body
    .filter((key): key is string => typeof key === 'string')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  const deletedKeys = await apiKeys.deleteKeys(c.env.DB, provider.id, keysToDelete);
  return c.json({ message: `${deletedKeys} API Keys deleted` });
});

// POST /providers/:name/keys/reset
app.post('/reset', async (c) => {
  const provider = c.get('provider');
  await apiKeys.resetByProvider(c.env.DB, provider.id);
  return c.json({ message: `All API keys for provider '${provider.name}' have been reset.` });
});

// GET /providers/:name/keys/:keyId
app.get('/:keyId', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));
  const key = await apiKeys.get(c.env.DB, keyId);

  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  return c.json({ key });
});

// PUT /providers/:name/keys/:keyId
app.put('/:keyId', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));
  const data = await c.req.json();

  const key = await apiKeys.get(c.env.DB, keyId);
  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  await apiKeys.update(c.env.DB, keyId, data);
  return c.json({ message: 'API Key updated' });
});

// DELETE /providers/:name/keys/:keyId
app.delete('/:keyId', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));

  const key = await apiKeys.get(c.env.DB, keyId);
  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  await apiKeys.delete(c.env.DB, keyId);
  return c.json({ message: 'API Key deleted' });
});

// POST /providers/:name/keys/:keyId/reset
app.post('/:keyId/reset', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));

  const key = await apiKeys.get(c.env.DB, keyId);
  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  await apiKeys.reset(c.env.DB, keyId);
  return c.json({ message: 'API Key statistics reset' });
});

const testKey = async (key: ApiKey, provider: Provider) => {
  return testProvider(provider, key.key, provider.test_model);
};

const isTimeoutError = (err: any) => err?.name === 'AbortError';

// GET /providers/:name/keys/:keyId/test
app.get('/:keyId/test', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));

  const key = await apiKeys.get(c.env.DB, keyId);
  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  let response: Response;
  try {
    response = await testKey(key, provider);
  } catch (e: any) {
    if (isTimeoutError(e)) return c.json({ success: false, status: 0, error: 'Request Timeout' }, 408);
    console.error(`Unknown Error testing key ${key.id}:`, e);
    throw e;
  }
  if (!response.ok) {
    const maxKeyFailures = await getMaxKeyFailures(c.env.DB);
    await apiKeys.recordFailure(c.env.DB, keyId, maxKeyFailures);
    const errorText = await response.text();
    return c.json({ success: false, status: response.status, error: errorText }, 400);
  }

  await apiKeys.resetFailure(c.env.DB, keyId);
  return c.json({ success: true, status: response.status });
});

// POST /providers/:name/keys/test-batch
app.post('/test-batch', async (c) => {
  const provider = c.get('provider');
  const body = await c.req.json();

  const limit = parseInt(body.limit ?? '100');
  if (isNaN(limit) || limit <= 0 || limit > 100) throw new HTTPException(400, { message: "Invalid parameter 'limit': must be between 1 and 100" });

  const cursor = parseInt(body.cursor ?? '0');
  if (isNaN(cursor) || cursor < 0) throw new HTTPException(400, { message: "Invalid parameter 'cursor': must be greater than or equal to 0" });

  let status: 'active' | 'invalid' | undefined = undefined;
  if (body.status) {
    const normalized = String(body.status).trim().toLowerCase();
    if (normalized !== 'active' && normalized !== 'invalid') throw new HTTPException(400, { message: "Invalid parameter 'status': must be 'active' or 'invalid'" });
    status = normalized;
  }

  const keys = await apiKeys.listByCursor(c.env.DB, provider.id, cursor, limit, status);
  const maxKeyFailures = await getMaxKeyFailures(c.env.DB);

  const testKeyWithResult = async (key: ApiKey) => {
    try {
      const response = await testKey(key, provider);
      if (!response.ok) {
        await apiKeys.recordFailure(c.env.DB, key.id, maxKeyFailures);
        return { id: key.id, success: false as const };
      }
      await apiKeys.resetFailure(c.env.DB, key.id);
      return { id: key.id, success: true as const };
    } catch (e: any) {
      if (isTimeoutError(e)) return { id: key.id, success: false as const };
      console.error(`Unknown Error testing key ${key.id}:`, e);
      return { id: key.id, success: false as const };
    }
  };

  const concurrencyLimit = await getTestKeyConcurrency(c.env.DB);
  const pool = new Set<Promise<void>>();
  const results: Array<{ id: number; success: boolean; }> = [];
  for (const key of keys) {
    const task = testKeyWithResult(key).then((r) => {
      results.push(r);
      pool.delete(task);
    });
    pool.add(task);
    if (pool.size >= concurrencyLimit) {
      await Promise.race(pool);
    }
  }
  await Promise.all(pool);

  const totalSuccess = results.filter(r => r.success).length;
  const totalFailures = results.filter(r => !r.success).length;
  const next_cursor = keys.length === limit ? keys[keys.length - 1].id : null;
  return c.json({ next_cursor, success: totalSuccess, fail: totalFailures });
});

export default app;
