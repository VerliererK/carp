import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { providers, apiKeys } from '../../lib/db';
import type { Provider, ApiKey } from '@shared/types';

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
app.get('/', async (c) => {
  const provider = c.get('provider');
  const keys = await apiKeys.list(c.env.DB, provider.id);
  return c.json(keys);
});

// POST /providers/:name/keys
app.post('/', async (c) => {
  const provider = c.get('provider');
  const body = await c.req.json();  // string[]

  if (!Array.isArray(body)) {
    throw new HTTPException(400, { message: 'Request body must be an array of API key objects.' });
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

// GET /providers/:name/keys/:keyId/test
app.get('/:keyId/test', async (c) => {
  const provider = c.get('provider');
  const keyId = parseInt(c.req.param('keyId'));

  const key = await apiKeys.get(c.env.DB, keyId);
  if (!key || key.provider_id !== provider.id) {
    throw new HTTPException(404, { message: 'API Key not found for this provider' });
  }

  const { base_url, test_path, test_model } = provider;
  const baseUrl = base_url.replace(/\/+$/, '');
  const testPath = (test_path || 'v1/chat/completions').replace(/^\/+/, '');
  const testUrl = `${baseUrl}/${testPath}`;
  const response = await fetch(testUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.key}`
    },
    body: JSON.stringify({
      model: test_model,
      messages: [{
        role: 'user',
        content: 'Hi',
      }],
      stream: false,
      max_tokens: 64
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return c.json({ success: false, status: response.status, error: errorText }, 400);
  }

  return c.json({ success: true, status: response.status });
});

export default app;
