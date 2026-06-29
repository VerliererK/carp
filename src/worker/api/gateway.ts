import type { Context, Hono } from 'hono';
import { models, modelMappings } from '../lib/db';
import { pickRandom } from '../lib/random';

export async function listModelsHandler(c: Context<{ Bindings: Env }>) {
  const allModels = await models.list(c.env.DB);
  const enabled = allModels.filter(m => m.enabled === 1 && m.mappings_count > 0);

  return c.json({
    object: 'list',
    data: enabled.map(m => ({
      id: m.name,
      object: 'model',
      owned_by: 'system',
    })),
  });
}

export function createGatewayHandler(app: Hono<{ Bindings: Env }>) {
  return async (c: Context<{ Bindings: Env }>) => {
    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Validate model field
    const rawModel = body.model;
    if (!rawModel || typeof rawModel !== 'string') {
      return c.json({ error: 'Missing or invalid "model" field' }, 400);
    }

    // Resolve model
    const mappings = await modelMappings.resolve(c.env.DB, rawModel);
    if (mappings.length === 0) {
      return c.json({ error: `Unknown model "${rawModel}"` }, 400);
    }

    const picked = pickRandom(mappings);
    if (!picked) {
      return c.json({ error: `Unknown model "${rawModel}"` }, 400);
    }

    // Rewrite body with the actual model name
    const rewrittenBody = { ...body, model: picked.model_name };

    // Build internal request to proxy
    const proxyPath = `/proxy/${picked.provider_name}${c.req.path}`;
    const request = new Request(new URL(proxyPath, c.req.url), {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify(rewrittenBody),
    });

    // Route internally through the existing proxy handler
    return app.request(request, undefined, c.env, c.executionCtx);
  };
}
