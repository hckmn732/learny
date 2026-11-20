import type { AiProviderValue } from '@learny/db';

import { llmMode } from './config';

export interface DiscoverProviderModelsInput {
  provider: AiProviderValue;
  apiKey?: string;
  baseUrl?: string;
}

export interface DiscoverProviderModelsOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]+$/;
const MAX_MODELS = 500;

function mockModels(provider: AiProviderValue): string[] {
  switch (provider) {
    case 'anthropic':
      return ['claude-sonnet-4-5', 'claude-haiku-4-5'];
    case 'openai':
      return ['gpt-5.5', 'gpt-5-mini'];
    case 'mistral':
      return ['mistral-large-latest', 'mistral-small-latest'];
    case 'deepseek':
      return ['deepseek-chat', 'deepseek-reasoner'];
    case 'openai_compatible':
      return ['compatible-model'];
    case 'local':
      return ['local-model'];
  }
}

function endpointOf(input: DiscoverProviderModelsInput): string {
  switch (input.provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1/models';
    case 'openai':
      return 'https://api.openai.com/v1/models';
    case 'mistral':
      return 'https://api.mistral.ai/v1/models';
    case 'deepseek':
      return 'https://api.deepseek.com/models';
    case 'openai_compatible':
    case 'local': {
      if (input.baseUrl === undefined) throw new Error('Base URL required');
      const base = input.baseUrl.replace(/\/+$/, '');
      return `${base}${base.endsWith('/v1') ? '/models' : '/v1/models'}`;
    }
  }
}

function headersOf(input: DiscoverProviderModelsInput): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (input.apiKey === undefined) return headers;
  switch (input.provider) {
    case 'anthropic':
      headers['x-api-key'] = input.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      return headers;
    default:
      headers.Authorization = `Bearer ${input.apiKey}`;
      return headers;
  }
}

function modelIdsOf(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const root = payload as { data?: unknown; models?: unknown };
  const entries = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : [];
  const ids = entries.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as { id?: unknown; model?: unknown; name?: unknown };
    const value = record.id ?? record.model ?? record.name;
    return typeof value === 'string' ? [value] : [];
  });
  return [...new Set(ids)]
    .map((id) => id.trim())
    .filter((id) => id !== '' && id.length <= 200 && MODEL_ID_PATTERN.test(id))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_MODELS);
}

export async function discoverProviderModels(
  input: DiscoverProviderModelsInput,
  options: DiscoverProviderModelsOptions = {},
): Promise<string[]> {
  const env = options.env ?? process.env;
  if (llmMode(env) === 'mock') return mockModels(input.provider);

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? 15_000);
  try {
    const response = await fetchImpl(endpointOf(input), {
      method: 'GET',
      headers: headersOf(input),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Provider model discovery failed (${String(response.status)})`);
    }
    return modelIdsOf(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
