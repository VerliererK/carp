import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { models, modelMappings, providers, apiKeys } from '../../lib/db';
import fetchTimeout from '@shared/fetchTimeout';
import { getMaxKeyFailures } from '../../lib/configs';

const app = new Hono<{ Bindings: Env }>();

function validateModelFields(value: any, required: true): { name: string; enabled: number };
function validateModelFields(value: any, required: false): Partial<{ name: string; enabled: number }>;
function validateModelFields(value: any, required = false): { name: string; enabled: number } | Partial<{ name: string; enabled: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HTTPException(400, { message: 'Request body must be an object' });
  }

  const data: any = {};

  // name
  if (value.name !== undefined) {
    if (typeof value.name !== 'string') throw new HTTPException(400, { message: 'Name must be a string' });
    const name = value.name.trim();
    if (!name) throw new HTTPException(400, { message: 'Name cannot be empty' });
    data.name = name;
  } else if (required) {
    throw new HTTPException(400, { message: 'Name is required' });
  }

  // enabled
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') throw new HTTPException(400, { message: 'enabled must be a boolean' });
    data.enabled = value.enabled ? 1 : 0;
  } else if (required) {
    data.enabled = 1;
  }

  if (!required && Object.keys(data).length === 0) throw new HTTPException(400, { message: 'At least one field must be provided' });

  return data;
}

function validateMappingFields(value: any, required: true): { provider_id: number; model_name: string };
function validateMappingFields(value: any, required: false): Partial<{ provider_id: number; model_name: string }>;
function validateMappingFields(value: any, required = false): { provider_id: number; model_name: string } | Partial<{ provider_id: number; model_name: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HTTPException(400, { message: 'Request body must be an object' });
  }

  const data: any = {};

  // provider_id
  if (value.provider_id !== undefined) {
    if (typeof value.provider_id !== 'number' || !Number.isInteger(value.provider_id)) {
      throw new HTTPException(400, { message: 'provider_id must be an integer' });
    }
    data.provider_id = value.provider_id;
  } else if (required) {
    throw new HTTPException(400, { message: 'provider_id is required' });
  }

  // model_name
  if (value.model_name !== undefined) {
    if (typeof value.model_name !== 'string') throw new HTTPException(400, { message: 'model_name must be a string' });
    const modelName = value.model_name.trim();
    if (!modelName) throw new HTTPException(400, { message: 'model_name cannot be empty' });
    data.model_name = modelName;
  } else if (required) {
    throw new HTTPException(400, { message: 'model_name is required' });
  }

  if (!required && Object.keys(data).length === 0) throw new HTTPException(400, { message: 'At least one field must be provided' });

  return data;
}

const modelValidator = validator('json', (value) => validateModelFields(value, true));
const modelUpdateValidator = validator('json', (value) => validateModelFields(value, false));
const mappingValidator = validator('json', (value) => validateMappingFields(value, true));
const mappingUpdateValidator = validator('json', (value) => validateMappingFields(value, false));

app.get('/', async (c) => {
  const result = await models.list(c.env.DB);
  return c.json(result);
});

app.post('/', modelValidator, async (c) => {
  const data = await c.req.valid('json');

  const existing = await models.getByName(c.env.DB, data.name);
  if (existing) throw new HTTPException(400, { message: 'Model already exists' });

  const model = await models.create(c.env.DB, data);
  return c.json({ model, message: 'Model created' }, 201);
});

app.get('/:name', async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const mappings = await modelMappings.listByModel(c.env.DB, model.id);
  return c.json({ ...model, mappings });
});

app.put('/:name', modelUpdateValidator, async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const data = await c.req.valid('json');

  if (data.name && data.name !== model.name) {
    const existing = await models.getByName(c.env.DB, data.name);
    if (existing) throw new HTTPException(400, { message: 'Model name already in use' });
  }

  await models.update(c.env.DB, model.id, data);
  return c.json({ message: 'Model updated' });
});

app.delete('/:name', async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  await models.delete(c.env.DB, model.id);
  return c.json({ message: 'Model deleted' });
});

app.post('/:name/mappings', mappingValidator, async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const data = await c.req.valid('json');

  const provider = await providers.get(c.env.DB, data.provider_id);
  if (!provider) throw new HTTPException(400, { message: 'Provider not found' });

  try {
    const mapping = await modelMappings.create(c.env.DB, {
      model_id: model.id,
      provider_id: data.provider_id,
      model_name: data.model_name,
    });
    return c.json({ mapping, message: 'Mapping created' }, 201);
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE constraint failed')) {
      throw new HTTPException(400, { message: 'Mapping for this provider already exists on this model' });
    }
    throw e;
  }
});

app.put('/:name/mappings/:id', mappingUpdateValidator, async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const mappingId = Number(c.req.param('id'));
  if (!Number.isInteger(mappingId)) throw new HTTPException(400, { message: 'Invalid mapping id' });

  const mapping = await modelMappings.get(c.env.DB, mappingId);
  if (!mapping || mapping.model_id !== model.id) {
    throw new HTTPException(404, { message: 'Mapping not found' });
  }

  const data = await c.req.valid('json');

  if (data.provider_id !== undefined) {
    const provider = await providers.get(c.env.DB, data.provider_id);
    if (!provider) throw new HTTPException(400, { message: 'Provider not found' });
  }

  await modelMappings.update(c.env.DB, mappingId, data);
  return c.json({ message: 'Mapping updated' });
});

app.delete('/:name/mappings/:id', async (c) => {
  const name = c.req.param('name');
  const model = await models.getByName(c.env.DB, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const mappingId = Number(c.req.param('id'));
  if (!Number.isInteger(mappingId)) throw new HTTPException(400, { message: 'Invalid mapping id' });

  const mapping = await modelMappings.get(c.env.DB, mappingId);
  if (!mapping || mapping.model_id !== model.id) {
    throw new HTTPException(404, { message: 'Mapping not found' });
  }

  await modelMappings.delete(c.env.DB, mappingId);
  return c.json({ message: 'Mapping deleted' });
});

// GET /:name/mappings/:id/test
app.get('/:name/mappings/:id/test', async (c) => {
  const name = c.req.param('name');
  const db = c.env.DB;

  const model = await models.getByName(db, name);
  if (!model) throw new HTTPException(404, { message: 'Model not found' });

  const mappingId = Number(c.req.param('id'));
  if (!Number.isInteger(mappingId)) throw new HTTPException(400, { message: 'Invalid mapping id' });

  const mapping = await modelMappings.get(db, mappingId);
  if (!mapping || mapping.model_id !== model.id) {
    throw new HTTPException(404, { message: 'Mapping not found' });
  }

  const provider = await providers.get(db, mapping.provider_id);
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  const keys = await apiKeys.listLRU(db, provider.id, { limit: 1 });
  if (keys.length === 0) {
    return c.json({ success: false, status: 0, error: 'No active API keys available for this provider' }, 400);
  }
  const key = keys[0];

  const baseUrl = provider.base_url.replace(/\/+$/, '');
  let response: Response;

  try {
    if (provider.type === 'gemini') {
      const testUrl = `${baseUrl}/v1beta/models/${mapping.model_name}:generateContent`;
      response = await fetchTimeout(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key.key,
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] }),
      });
    } else {
      const testPath = (provider.test_path || 'v1/chat/completions').replace(/^\/+/, '');
      const testUrl = `${baseUrl}/${testPath}`;
      const useMaxCompletionTokens = /^gpt-5/.test(mapping.model_name);
      response = await fetchTimeout(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key.key}`,
        },
        body: JSON.stringify({
          model: mapping.model_name,
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          ...(useMaxCompletionTokens ? { max_completion_tokens: 64 } : { max_tokens: 64 }),
        }),
      });
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return c.json({ success: false, status: 0, error: 'Request Timeout' }, 408);
    }
    throw e;
  }

  if (!response.ok) {
    const maxKeyFailures = await getMaxKeyFailures(db);
    await apiKeys.recordFailure(db, key.id, maxKeyFailures);
    const errorText = await response.text();
    return c.json({ success: false, status: response.status, error: errorText }, 400);
  }

  await apiKeys.resetFailure(db, key.id);
  return c.json({ success: true, status: response.status });
});

export default app;
