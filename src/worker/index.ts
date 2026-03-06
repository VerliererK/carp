import { Hono, MiddlewareHandler } from 'hono';
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception';
import apiRoutes from './api';
import { proxyHandler, matchGemini } from './api/proxy';
import { createGatewayHandler, listModelsHandler } from './api/gateway';
import { requestLogs, providers, apiKeys } from './lib/db';
import { getLogRetentionDays, getTestKeyConcurrency } from './lib/configs';

const app = new Hono<{ Bindings: Env }>();

const authMiddleware = bearerAuth({
  verifyToken: async (token, c) => {
    const expectedToken = c.env.AUTH_TOKEN;
    if (!expectedToken) {
      throw new HTTPException(500, { message: 'AUTH_TOKEN environment variable is not set' });
    }
    return token === expectedToken;
  }
});

const geminiAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.query('key') || c.req.header('x-goog-api-key');
  const expectedToken = c.env.AUTH_TOKEN;
  if (!expectedToken) {
    throw new HTTPException(500, { message: 'AUTH_TOKEN environment variable is not set' });
  }
  if (token !== expectedToken) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
  return next();
};

const proxyAuthMiddleware: MiddlewareHandler = async (c, next) => {
  if (matchGemini(c.req.path)) {
    return geminiAuthMiddleware(c, next);
  }
  return authMiddleware(c, next);
}

app.onError((err, c) => {
  const { method, url } = c.req;
  let status = 500;
  let message = 'Internal server error';

  if (err instanceof HTTPException) {
    status = err.status;
    message = err.message || err.res?.statusText || message;
    const logger = status >= 500 ? console.error : console.warn;
    logger(`[${method} ${url}] -> ${status}`, message);
  } else {
    console.error(`[${method} ${url}] -> 500`, err);
  }

  return c.json({ error: message }, status as any);
});

// --- Routes ---
app.use('/api/*', authMiddleware);
app.use('/proxy/*', proxyAuthMiddleware);
app.use('/v1/*', proxyAuthMiddleware);
app.all('/proxy/:provider/*', proxyHandler);
app.get('/v1/models', listModelsHandler);
app.post('/v1/*', createGatewayHandler(app));
app.route('/api', apiRoutes);

export default {
  fetch: app.fetch,
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === '0 0 * * *') {
      ctx.waitUntil((async () => {
        const retentionDays = await getLogRetentionDays(env.DB);
        const deleted = await requestLogs.deleteOlderThan(env.DB, retentionDays);
        if (deleted > 0) {
          console.info(`[scheduled] deleted ${deleted} request log(s)`);
        }
      })());
    }

    if (controller.cron === '0 * * * *') {
      ctx.waitUntil((async () => {
        const allProviders = await providers.list(env.DB);
        const targets: Array<{ provider: typeof allProviders[0]; key: { id: number } }> = [];

        for (const p of allProviders) {
          if (p.enabled !== 1 || p.invalid_key_count <= 0) continue;
          const invalidKeys = await apiKeys.list(env.DB, p.id, 'invalid');
          for (const k of invalidKeys) {
            targets.push({ provider: p, key: k });
          }
        }

        if (targets.length === 0) return;

        const concurrencyLimit = await getTestKeyConcurrency(env.DB);
        const pool = new Set<Promise<void>>();

        for (const { provider, key } of targets) {
          const task = (async () => {
            const res = await app.request(
              `/api/admin/providers/${provider.name}/keys/${key.id}/test`,
              { method: 'GET', headers: { Authorization: `Bearer ${env.AUTH_TOKEN}` } },
              env,
            );
            if (res.ok) {
              console.log(`[scheduled] provider=${provider.name} key_id=${key.id} -> active!!`);
            }
          })().then(() => { pool.delete(task); });
          pool.add(task);
          if (pool.size >= concurrencyLimit) await Promise.race(pool);
        }
        await Promise.all(pool);
      })());
    }
  }
};
