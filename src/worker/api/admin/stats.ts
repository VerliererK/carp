import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestLogs } from '../../lib/db';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const period = c.req.query('period') as '24h' | '7d' | undefined;

  if (period && period !== '24h' && period !== '7d') {
    throw new HTTPException(400, { message: 'Invalid period. Must be "24h" or "7d"' });
  }

  const stats = await requestLogs.getStats(c.env.DB, period || '24h');

  return c.json(stats);
});

app.get('/timeseries', async (c) => {
  const period = c.req.query('period') as '24h' | '7d' | undefined;

  if (period && period !== '24h' && period !== '7d') {
    throw new HTTPException(400, { message: 'Invalid period. Must be "24h" or "7d"' });
  }

  const timeseries = await requestLogs.getTimeSeriesStats(c.env.DB, period || '24h');

  return c.json(timeseries);
});

export default app;
