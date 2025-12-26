import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { providers } from '../../lib/db';
import type { Provider } from '@shared/types';
import keysRoute from './provider-keys';

const app = new Hono<{ Bindings: Env }>();

app.route('/:name/keys', keysRoute);

app.get('/', async (c) => {
  const result = await providers.list(c.env.DB);
  return c.json(result);
});

app.get('/:name', async (c) => {
  const name = c.req.param('name');
  const provider = await providers.getByName(c.env.DB, name);
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  return c.json(provider);
});

function validateProviderFields(value: any, required: true): Omit<Provider, 'id'>;
function validateProviderFields(value: any, required: false): Partial<Omit<Provider, 'id'>>;
function validateProviderFields(value: any, required = false): Omit<Provider, 'id'> | Partial<Omit<Provider, 'id'>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HTTPException(400, { message: 'Request body must be an object' });
  }

  const data: any = {};

  // name
  if (value.name !== undefined) {
    if (typeof value.name !== 'string') throw new HTTPException(400, { message: 'Name must be a string' });
    const name = value.name.trim();
    if (!name) throw new HTTPException(400, { message: 'Name cannot be empty' });
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new HTTPException(400, { message: 'Name can only contain letters, numbers, hyphens, and underscores' });
    if (name.length > 50) throw new HTTPException(400, { message: 'Name cannot be longer than 50 characters' });
    data.name = name;
  } else if (required) {
    throw new HTTPException(400, { message: 'Name is required' });
  }

  // base_url
  if (value.base_url !== undefined) {
    if (typeof value.base_url !== 'string') throw new HTTPException(400, { message: 'Base URL must be a string' });
    const baseUrl = value.base_url.trim();
    if (!baseUrl) throw new HTTPException(400, { message: 'Base URL cannot be empty' });
    try {
      new URL(baseUrl);
      data.base_url = baseUrl;
    } catch {
      throw new HTTPException(400, { message: 'Invalid Base URL' });
    }
  } else if (required) {
    throw new HTTPException(400, { message: 'Base URL is required' });
  }

  // type
  if (value.type !== undefined) {
    if (typeof value.type !== 'string') throw new HTTPException(400, { message: 'Type must be a string' });
    const type = value.type.trim();
    if (!type) throw new HTTPException(400, { message: 'Type cannot be empty' });
    data.type = type;
  } else if (required) {
    data.type = 'openai';
  }

  // custom_headers
  if (value.custom_headers !== undefined) {
    if (value.custom_headers === null) {
      data.custom_headers = null;
    } else if (typeof value.custom_headers === 'string') {
      const trimmed = value.custom_headers.trim();
      if (!trimmed) {
        data.custom_headers = null;
      } else {
        try {
          JSON.parse(trimmed);
          data.custom_headers = trimmed;
        } catch {
          throw new HTTPException(400, { message: 'Invalid custom_headers JSON' });
        }
      }
    } else {
      throw new HTTPException(400, { message: 'Custom headers must be a JSON string or null' });
    }
  }

  // enabled
  if (!required && value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') throw new HTTPException(400, { message: 'enabled must be a boolean (true or false)' });
    data.enabled = value.enabled ? 1 : 0;
  } else if (required) {
    data.enabled = 1;
  }

  // test_path
  if (value.test_path !== undefined) {
    if (value.test_path === null) {
      data.test_path = null;
    } else if (typeof value.test_path !== 'string') {
      throw new HTTPException(400, { message: 'test_path must be a string or null' });
    } else {
      const testPath = value.test_path.trim();
      data.test_path = testPath || null;
    }
  }

  // test_model
  if (value.test_model !== undefined) {
    if (value.test_model === null) {
      data.test_model = null;
    } else if (typeof value.test_model !== 'string') {
      throw new HTTPException(400, { message: 'test_model must be a string or null' });
    } else {
      const testModel = value.test_model.trim();
      data.test_model = testModel || null;
    }
  }

  if (!required && Object.keys(data).length === 0) throw new HTTPException(400, { message: 'At least one field must be provided' });

  return data;
}

const providerValidator = validator('json', (value) => validateProviderFields(value, true));
const providerUpdateValidator = validator('json', (value) => validateProviderFields(value, false));

app.post('/', providerValidator, async (c) => {
  const data = await c.req.valid('json');

  const existingProvider = await providers.getByName(c.env.DB, data.name);
  if (existingProvider) throw new HTTPException(400, { message: 'Provider already exists' });

  const provider = await providers.create(c.env.DB, data);
  return c.json({ provider, message: 'Provider created' }, 201);
});

app.put('/:name', providerUpdateValidator, async (c) => {
  const name = c.req.param('name');
  const provider = await providers.getByName(c.env.DB, name);
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  const data = await c.req.valid('json');

  await providers.update(c.env.DB, provider.id, data);
  return c.json({ message: 'Provider updated' });
});

app.delete('/:name', async (c) => {
  const name = c.req.param('name');
  const provider = await providers.getByName(c.env.DB, name);
  if (!provider) throw new HTTPException(404, { message: 'Provider not found' });

  await providers.delete(c.env.DB, provider.id);

  return c.json({ message: 'Provider deleted' });
});

export default app;
