import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createMockServer, http, HttpResponse } from '@learny/testing/msw';

import { buildAnthropicOptions, buildAnthropicSystem } from './anthropic-options';
import { createAnthropicFetch, LEARNY_FALLBACK_HEADER, LEARNY_TASK_HEADER } from './anthropic-fetch';

const bodies: Record<string, unknown>[] = [];
const headersSeen: Headers[] = [];

const server = createMockServer(
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    bodies.push(body);
    headersSeen.push(new Headers(request.headers));
    return HttpResponse.json({
      id: `msg_${String(bodies.length)}`,
      type: 'message',
      role: 'assistant',
      model: typeof body.model === 'string' ? body.model : 'claude-opus-5-5',
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 2 },
    });
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
});

const MODEL = createAnthropicFetch();
const PROVIDER = createAnthropic({ apiKey: 'sk-ant-test', fetch: MODEL });

describe('[SPEC-504] corps de requête Anthropic (MSW)', () => {
  it.each([
    ['programme', 'claude-opus-5-5', 'high'],
    ['course', 'claude-opus-5-5', 'medium'],
    ['gaps', 'claude-opus-5-5', 'medium'],
    ['tutor', 'claude-sonnet-5-5', 'low'],
    ['light', 'claude-haiku-5-5', 'low'],
  ] as const)('CA-2 — %s : thinking adaptatif et effort %s', async (task, modelId, effort) => {
    bodies.length = 0;
    headersSeen.length = 0;
    const options = buildAnthropicOptions({ task, modelId, managed: true });
    const model = PROVIDER(modelId);
    await generateText({
      model,
      system: buildAnthropicSystem([
        { text: 'Consigne stable', cache: true },
        { text: 'Question', cache: false },
      ]),
      messages: [{ role: 'user', content: 'Bonjour' }],
      tools: {
        read_resources: tool({
          description: 'Lit les passages',
          inputSchema: z.object({ query: z.string() }),
          strict: true,
        }),
      },
      toolChoice: 'auto',
      headers: {
        [LEARNY_TASK_HEADER]: task,
        [LEARNY_FALLBACK_HEADER]: task === 'light' ? '0' : '1',
      },
      providerOptions: options.providerOptions,
    });
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort });
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('budget_tokens');
    expect(body.tools).toEqual([
      expect.objectContaining({
        name: 'read_resources',
        strict: true,
        input_schema: expect.objectContaining({ additionalProperties: false }),
      }),
    ]);
    const system = body.system as { type: string; text: string; cache_control?: unknown }[];
    expect(system.at(-1)?.cache_control).toBeUndefined();
    expect(system.filter((part) => part.cache_control !== undefined)).toHaveLength(1);
    expect(system[0]?.text).toBe('Consigne stable');
    const expectedFallback = task !== 'light';
    expect(body.fallbacks).toBe(expectedFallback ? 'default' : undefined);
    const beta = headersSeen[0]?.get('anthropic-beta') ?? '';
    if (expectedFallback) expect(beta).toContain('server-side-fallback-2026-07-01');
    else expect(beta).not.toContain('server-side-fallback-2026-07-01');
    expect(headersSeen[0]?.get(LEARNY_TASK_HEADER)).toBeNull();
    expect(headersSeen[0]?.get(LEARNY_FALLBACK_HEADER)).toBeNull();
  });
});
