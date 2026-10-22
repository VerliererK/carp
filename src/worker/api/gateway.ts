import type { Context, Hono } from 'hono';
import { models, modelMappings } from '../lib/db';
import { shuffle } from '../lib/random';
import { usesMaxCompletionTokens } from '../lib/provider-request';
import { getMaxAttempts, getRetryStatusCodes } from '../lib/configs';
import { matchesRetryStatus } from '@shared/settings';

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

    // Try other mappings when a provider keeps failing
    const maxAttempts = await getMaxAttempts(c.env.DB);
    const retryStatusCodes = await getRetryStatusCodes(c.env.DB);

    let lastResponse: Response | undefined;
    for (const picked of shuffle(mappings).slice(0, maxAttempts)) {
      await lastResponse?.body?.cancel().catch(() => {});

      // Rewrite body with the actual model name
      const rewrittenBody: Record<string, unknown> = { ...body, model: picked.model_name };
      if (usesMaxCompletionTokens(picked.model_name) && 'max_tokens' in rewrittenBody) {
        rewrittenBody.max_completion_tokens ??= rewrittenBody.max_tokens;
        delete rewrittenBody.max_tokens;
      }

      // Build internal request to proxy
      const proxyPath = `/proxy/${picked.provider_name}${c.req.path}`;
      const request = new Request(new URL(proxyPath, c.req.url), {
        method: 'POST',
        headers: c.req.raw.headers,
        body: JSON.stringify(rewrittenBody),
      });

      // Route internally through the existing proxy handler
      const response = await app.request(request, undefined, c.env, c.executionCtx);

      if (response.ok || !matchesRetryStatus(response.status, retryStatusCodes)) {
        return response;
      }

      console.log(`Mapping provider '${picked.provider_name}' model '${picked.model_name}' failed with status ${response.status}. Trying next mapping...`);
      lastResponse = response;
    }

    // All mappings exhausted
    return lastResponse!;
  };
}
