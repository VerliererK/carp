import type { Provider } from '@shared/types';
import fetchTimeout from '@shared/fetchTimeout';

const ALLOWED_HEADERS = new Set([
  'content-type',
  'accept',
  'accept-encoding',
  'accept-language',
]);

const ALLOWED_HEADER_PREFIXES = [
  'anthropic-',
  'openai-',
];

export function sanitizeHeaders(
  originalHeaders: Headers,
  provider: Provider
): Headers {
  const headers = new Headers();

  for (const key of ALLOWED_HEADERS) {
    const value = originalHeaders.get(key);
    if (value) headers.set(key, value);
  }

  for (const [key, value] of originalHeaders.entries()) {
    const lower = key.toLowerCase();
    if (ALLOWED_HEADER_PREFIXES.some((p) => lower.startsWith(p))) {
      headers.set(key, value);
    }
  }

  applyCustomHeaders(headers, provider);

  return headers;
}

export function createHeaders(
  provider: Provider,
  apiKey: string,
  baseHeaders?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);
  applyCustomHeaders(headers, provider);

  if (provider.type === 'gemini') {
    headers.set('x-goog-api-key', apiKey);
  } else {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }

  return headers;
}

export function testProvider(
  provider: Provider,
  apiKey: string,
  model?: string | null
): Promise<Response> {
  if (provider.type === 'gemini') {
    return testGemini(provider, apiKey, model);
  }

  return testChatCompletions(provider, apiKey, model);
}

export function listModels(
  provider: Provider,
  apiKey: string
): Promise<Response> {
  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const modelsPath = provider.type === 'gemini' ? 'v1beta/models' : 'v1/models';

  return fetchTimeout(`${baseUrl}/${modelsPath}`, { headers: createHeaders(provider, apiKey) });
}

function testChatCompletions(
  provider: Provider,
  apiKey: string,
  model?: string | null
): Promise<Response> {
  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const testPath = (provider.test_path || 'v1/chat/completions').replace(/^\/+/, '');
  const testUrl = `${baseUrl}/${testPath}`;
  const useMaxCompletionTokens = /^gpt-5/.test(model || '');

  return fetchTimeout(testUrl, {
    method: 'POST',
    headers: createHeaders(provider, apiKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: 'Hi',
      }],
      stream: false,
      ...(useMaxCompletionTokens ? { max_completion_tokens: 64 } : { max_tokens: 64 })
    })
  });
}

function testGemini(
  provider: Provider,
  apiKey: string,
  model?: string | null
): Promise<Response> {
  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const testUrl = `${baseUrl}/v1beta/models/${model}:generateContent`;

  return fetchTimeout(testUrl, {
    method: 'POST',
    headers: createHeaders(provider, apiKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
  });
}

function applyCustomHeaders(headers: Headers, provider: Provider) {
  if (!provider.custom_headers) return;

  try {
    const customHeaders = JSON.parse(provider.custom_headers);
    for (const [key, value] of Object.entries(customHeaders)) {
      headers.set(key, value as string);
    }
  } catch (e) {
    console.error('Failed to parse custom_headers:', e);
  }
}
