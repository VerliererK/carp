import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SETTING_DEFINITIONS, parseSettingValue, type ManagedSettingDefinition, type SettingKey, type SettingsPayload } from '@shared/settings';
import { systemSettings } from '../../lib/db';

const app = new Hono<{ Bindings: Env }>();

function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_DEFINITIONS;
}

function validateAndSerializeSettingValue(value: unknown, definition: ManagedSettingDefinition): string {
  if (definition.kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new HTTPException(400, { message: 'Value must be a boolean' });
    }
    return String(value);
  }

  if (definition.kind === 'string') {
    if (typeof value !== 'string') {
      throw new HTTPException(400, { message: 'Value must be a string' });
    }
    if (definition.minLength !== undefined && value.length < definition.minLength) {
      throw new HTTPException(400, { message: `Value length must be at least ${definition.minLength}` });
    }
    if (definition.maxLength !== undefined && value.length > definition.maxLength) {
      throw new HTTPException(400, { message: `Value length must be at most ${definition.maxLength}` });
    }
    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HTTPException(400, { message: 'Value must be a finite number' });
  }
  if (definition.kind === 'int' && !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'Value must be an integer' });
  }
  if (value < definition.min || value > definition.max) {
    throw new HTTPException(400, { message: `Value must be between ${definition.min} and ${definition.max}` });
  }
  return String(value);
}

app.get('/', async (c) => {
  const settings = {} as SettingsPayload;
  for (const key of Object.keys(SETTING_DEFINITIONS) as SettingKey[]) {
    const setting = await systemSettings.get(c.env.DB, key);
    const definition = SETTING_DEFINITIONS[key];
    const rawValue = setting?.value ?? String(definition.default);
    settings[key] = parseSettingValue(rawValue, definition);
  }

  return c.json(settings);
});

app.put('/:key', async (c) => {
  const key = c.req.param('key');
  if (!isSettingKey(key)) {
    throw new HTTPException(400, { message: `Setting '${key}' is not valid` });
  }

  const definition = SETTING_DEFINITIONS[key];
  const { value } = await c.req.json<{ value: unknown }>();
  const serialized = validateAndSerializeSettingValue(value, definition);

  await systemSettings.set(c.env.DB, key, serialized);

  return c.json({ key, value, message: 'Setting updated' });
});

export default app;
