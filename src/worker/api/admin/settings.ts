import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { systemSettings } from '../../lib/db';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const settings = await systemSettings.getAll(c.env.DB);
  return c.json(settings);
});

app.get('/:key', async (c) => {
  const key = c.req.param('key');
  const value = await systemSettings.get(c.env.DB, key);

  if (value === null) {
    throw new HTTPException(404, { message: 'Setting not found' })
  }

  return c.json({ key, value });
});

app.put('/:key', async (c) => {
  const key = c.req.param('key');
  const { value } = await c.req.json<{ value: any }>();
  await systemSettings.set(c.env.DB, key, value);

  return c.json({ key, value, message: 'Setting updated' });
});

app.delete('/:key', async (c) => {
  const key = c.req.param('key');
  await systemSettings.delete(c.env.DB, key);

  return c.json({ message: 'Setting deleted' });
});

export default app;
