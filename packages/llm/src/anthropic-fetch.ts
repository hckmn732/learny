// Fetch wrapper of the Anthropic provider (SPEC-504 ET-4). It rewrites the JSON body and the
// headers so the contract is the same whatever the installed @ai-sdk/anthropic version maps
// natively: adaptive thinking, effort, automatic tool choice, strict tools, at most four cache
// points, no sampling parameters, and the server-side fallback beta for provided Opus/Sonnet.
import { AI_MODEL_IDS, type AiTask } from '@learny/config';

import { FALLBACK_BETA, MAX_CACHE_BREAKPOINTS } from './anthropic-options';
import { TASK_CONFIG } from './tasks';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const LEARNY_TASK_HEADER = 'x-learny-llm-task';
export const LEARNY_MANAGED_HEADER = 'x-learny-llm-managed';
export const LEARNY_FALLBACK_HEADER = 'x-learny-llm-fallback';
export const LEARNY_MODEL_HEADER = 'x-learny-llm-model';

const PRIVATE_HEADERS = [
  LEARNY_TASK_HEADER,
  LEARNY_MANAGED_HEADER,
  LEARNY_FALLBACK_HEADER,
  LEARNY_MODEL_HEADER,
] as const;

function isTask(value: string | null): value is AiTask {
  return value !== null && Object.hasOwn(TASK_CONFIG, value);
}

function readHeader(headers: Headers, name: string): string | null {
  return headers.get(name);
}

function removePrivateHeaders(headers: Headers): void {
  for (const header of PRIVATE_HEADERS) headers.delete(header);
}

function mergeBeta(headers: Headers, beta: string | null): void {
  const existing = headers.get('anthropic-beta');
  const values = new Set(
    (existing ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  );
  if (beta !== null) values.add(beta);
  if (values.size === 0) headers.delete('anthropic-beta');
  else headers.set('anthropic-beta', [...values].join(','));
}

function isMessagesRequest(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/$/, '') === '/v1/messages';
  } catch {
    return false;
  }
}

interface CacheablePart {
  cache_control?: unknown;
}

function stripExtraCachePoints(body: Record<string, unknown>): void {
  const system = Array.isArray(body.system) ? (body.system as CacheablePart[]) : [];
  let seen = 0;
  const keep = (part: CacheablePart): void => {
    if (part.cache_control === undefined) return;
    seen += 1;
    if (seen > MAX_CACHE_BREAKPOINTS) delete part.cache_control;
  };
  for (const part of system) keep(part);
  const tools = Array.isArray(body.tools) ? (body.tools as CacheablePart[]) : [];
  for (const tool of tools) keep(tool);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (const message of messages) {
    if (message === null || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content as CacheablePart[]) keep(part);
  }
}

function strictSchema(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object') return schema;
  return { ...(schema as Record<string, unknown>), additionalProperties: false };
}

function rewriteBody(
  body: Record<string, unknown>,
  task: AiTask | null,
  fallback: boolean,
): void {
  // Adaptive thinking only; the 5.5 models reject `budget_tokens`.
  const thinking =
    body.thinking !== null && typeof body.thinking === 'object'
      ? (body.thinking as Record<string, unknown>)
      : {};
  delete thinking.budget_tokens;
  delete thinking.budgetTokens;
  body.thinking = { ...thinking, type: 'adaptive' };

  if (task !== null) {
    const output =
      body.output_config !== null && typeof body.output_config === 'object'
        ? (body.output_config as Record<string, unknown>)
        : {};
    body.output_config = { ...output, effort: TASK_CONFIG[task].effort };
  }

  // Forced tool choice is refused by Opus/Sonnet 5.5; sampling is never sent with thinking.
  delete body.temperature;
  delete body.top_p;
  delete body.top_k;
  if (Array.isArray(body.tools)) {
    body.tool_choice = { type: 'auto' };
    body.tools = (body.tools as Record<string, unknown>[]).map((tool) => ({
      ...tool,
      ...(tool.input_schema === undefined ? {} : { input_schema: strictSchema(tool.input_schema) }),
      strict: true,
    }));
  }

  const model = typeof body.model === 'string' ? body.model : '';
  const eligible =
    fallback &&
    (model === AI_MODEL_IDS.opus || model === AI_MODEL_IDS.sonnet);
  if (eligible) body.fallbacks = 'default';
  else delete body.fallbacks;

  stripExtraCachePoints(body);
}

/**
 * Wraps a fetch implementation. `baseFetch` is injectable so unit tests never reach the network.
 * Only `POST /v1/messages` is rewritten; the Files API and other endpoints pass through.
 */
export function createAnthropicFetch(baseFetch?: FetchLike): FetchLike {
  return async (input, init) => {
    const fetchImpl = baseFetch ?? (globalThis.fetch as FetchLike);
    const request = input instanceof Request ? input : undefined;
    const url = request?.url ?? String(input);
    if (!isMessagesRequest(url)) return fetchImpl(input, init);

    const headers = new Headers(request !== undefined ? request.headers : init?.headers);
    const taskHeader = readHeader(headers, LEARNY_TASK_HEADER);
    const task = isTask(taskHeader) ? taskHeader : null;
    const fallback = readHeader(headers, LEARNY_FALLBACK_HEADER) === '1';
    const raw =
      request !== undefined
        ? await request.clone().text()
        : typeof init?.body === 'string'
          ? init.body
          : null;
    if (raw === null) return fetchImpl(input, init);
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object') {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // Provider bodies are always JSON; an unreadable body is forwarded untouched.
      return fetchImpl(input, init);
    }
    rewriteBody(body, task, fallback);
    removePrivateHeaders(headers);
    const eligibleFallback =
      fallback && (body.model === AI_MODEL_IDS.opus || body.model === AI_MODEL_IDS.sonnet);
    if (eligibleFallback) mergeBeta(headers, FALLBACK_BETA);
    else mergeBeta(headers, null);
    if (request !== undefined) {
      // A Request instance is cloned so the caller's body stream is not consumed twice.
      return fetchImpl(new Request(request, { body: JSON.stringify(body), headers }));
    }
    return fetchImpl(url, { ...init, body: JSON.stringify(body), headers });
  };
}

/** Default wrapper used by the provider factory. */
export const anthropicFetch: FetchLike = createAnthropicFetch();

/**
 * For a plain `fetch(url, init)` call (tests): applies the same rewrite to an init object.
 * The provider always uses the Request form above; this helper keeps the contract testable.
 */
export function rewriteAnthropicInit(
  init: RequestInit,
  options: { task: AiTask; fallback: boolean },
): { body: string; headers: Headers } {
  const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
  rewriteBody(body, options.task, options.fallback);
  const headers = new Headers(init.headers);
  removePrivateHeaders(headers);
  if (options.fallback) mergeBeta(headers, FALLBACK_BETA);
  return { body: JSON.stringify(body), headers };
}
