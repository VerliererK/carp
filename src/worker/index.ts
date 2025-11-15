import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception';
import apiRoutes from './api';
import { proxyHandler } from './api/proxy';

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
app.use('/proxy/*', authMiddleware);
app.all('/proxy/:provider/*', proxyHandler);
app.route('/api', apiRoutes);

export default app;
